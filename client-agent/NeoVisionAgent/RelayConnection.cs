using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace NeoVisionAgent
{
    /// <summary>
    /// Manages the WebSocket connection to the NeoVision relay server.
    /// Handles registration, heartbeat, screen streaming, and command routing.
    /// </summary>
    public class RelayConnection
    {
        private readonly AgentConfig _config;
        private readonly ScreenCapture _screenCapture;
        private readonly InputInjector _inputInjector;
        private readonly FileHandler _fileHandler;
        private readonly Action<string> _updateStatus;

        private ClientWebSocket _ws;
        private CancellationTokenSource _streamCts;
        private bool _sessionActive;

        // Packet type constants — must match relay server's broker.js
        private static class PacketType
        {
            public const string AgentRegister  = "AGENT_REGISTER";
            public const string AgentHeartbeat = "AGENT_HEARTBEAT";
            public const string AgentFrame     = "AGENT_FRAME";
            public const string AdminInput     = "ADMIN_INPUT";
            public const string AdminScreenshot= "ADMIN_SCREENSHOT";
            public const string AdminRun       = "ADMIN_RUN";
            public const string AdminFileChunk = "ADMIN_FILE_CHUNK";
            public const string SessionStarted = "SESSION_STARTED";
            public const string SessionEnded   = "SESSION_ENDED";
            public const string Error          = "ERROR";
        }

        public RelayConnection(
            AgentConfig config,
            ScreenCapture screenCapture,
            InputInjector inputInjector,
            FileHandler fileHandler,
            Action<string> updateStatus)
        {
            _config        = config;
            _screenCapture = screenCapture;
            _inputInjector = inputInjector;
            _fileHandler   = fileHandler;
            _updateStatus  = updateStatus;
        }

        /// <summary>
        /// Connects to the relay server and starts the message loop.
        /// Returns when the connection is lost or cancelled.
        /// </summary>
public async Task ConnectAsync(CancellationToken token)
{
    // Always create a fresh WebSocket instance on each connection attempt
    _ws = new ClientWebSocket();

    AgentLogger.Log("RelayConnection", "Attempting to connect to: [" + _config.RelayUrl + "]");

    await _ws.ConnectAsync(new Uri(_config.RelayUrl), token);
    AgentLogger.Log("RelayConnection", "Connected to relay server");
    _updateStatus("Connected");

    await RegisterAsync(token);
    _ = HeartbeatLoopAsync(token);
    await ReceiveLoopAsync(token);
}

public void Disconnect()
{
    _streamCts?.Cancel();
    try { _ws?.Abort(); } catch { }
    try { _ws?.Dispose(); } catch { }
    _ws = null;
}

        // ── Registration ───────────────────────────────────────────────────────

        private async Task RegisterAsync(CancellationToken token)
        {
            var deviceId   = DeviceId.Get();
            var hostname   = System.Environment.MachineName;
            var osVersion  = System.Environment.OSVersion.ToString();

            await SendJsonAsync(new
            {
                type         = PacketType.AgentRegister,
                deviceId,
                hostname,
                osVersion,
                agentVersion = _config.AgentVersion
            }, token);

            AgentLogger.Log("RelayConnection", $"Registered as {deviceId} ({hostname})");
        }

        // ── Heartbeat ──────────────────────────────────────────────────────────

        private async Task HeartbeatLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested &&
                   _ws.State == WebSocketState.Open)
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(_config.HeartbeatIntervalSeconds),
                    token
                ).ContinueWith(_ => { });

                if (_ws.State == WebSocketState.Open)
                {
                    await SendJsonAsync(new { type = PacketType.AgentHeartbeat }, token);
                }
            }
        }

        // ── Receive loop ───────────────────────────────────────────────────────

        private async Task ReceiveLoopAsync(CancellationToken token)
        {
            var buffer = new byte[1024 * 256]; // 256 KB receive buffer

            while (!token.IsCancellationRequested &&
                   _ws.State == WebSocketState.Open)
            {
                try
                {
                    var result = await _ws.ReceiveAsync(
                        new ArraySegment<byte>(buffer), token
                    );

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        AgentLogger.Log("RelayConnection", "Server closed connection");
                        break;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        await HandlePacketAsync(json, token);
                    }
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    AgentLogger.Log("RelayConnection", $"ReceiveLoop error: {ex.Message}");
                    break;
                }
            }
        }

        // ── Packet handler ─────────────────────────────────────────────────────

        private async Task HandlePacketAsync(string json, CancellationToken token)
        {
            try
            {
                var packet = JObject.Parse(json);
                var type   = packet["type"]?.ToString();

                switch (type)
                {
                    case PacketType.SessionStarted:
                        _sessionActive = true;
                        _updateStatus("In session");
                        AgentLogger.Log("RelayConnection", "Session started");
                        StartScreenStream(token);
                        break;

                    case PacketType.SessionEnded:
                        _sessionActive = false;
                        _updateStatus("Connected — idle");
                        _streamCts?.Cancel();
                        AgentLogger.Log("RelayConnection", "Session ended");
                        break;

                    case PacketType.AdminInput:
                        HandleInput(packet);
                        break;

                    case PacketType.AdminScreenshot:
                        await SendScreenshotAsync(token);
                        break;

                    case PacketType.AdminRun:
                        HandleRun(packet);
                        break;

                    case PacketType.AdminFileChunk:
                        HandleFileChunk(packet);
                        break;

                    case PacketType.Error:
                        AgentLogger.Log("RelayConnection", $"Relay error: {packet["message"]}");
                        break;
                }
            }
            catch (Exception ex)
            {
                AgentLogger.Log("RelayConnection", $"HandlePacket error: {ex.Message}");
            }
        }

        // ── Screen streaming ───────────────────────────────────────────────────

        private void StartScreenStream(CancellationToken parentToken)
        {
            _streamCts = CancellationTokenSource.CreateLinkedTokenSource(parentToken);
            _ = StreamLoopAsync(_streamCts.Token);
        }

        private async Task StreamLoopAsync(CancellationToken token)
        {
            AgentLogger.Log("RelayConnection", "Screen stream started");

            while (!token.IsCancellationRequested &&
                   _ws.State == WebSocketState.Open &&
                   _sessionActive)
            {
                try
                {
                    var frame = _screenCapture.CaptureFrame(quality: 60);

                    if (frame.Length > 0)
                    {
                        var (w, h) = _screenCapture.GetScreenSize();

                        // Send frame metadata as JSON header
                        await SendJsonAsync(new
                        {
                            type   = PacketType.AgentFrame,
                            width  = w,
                            height = h,
                            size   = frame.Length
                        }, token);

                        // Send raw frame bytes
                        await _ws.SendAsync(
                            new ArraySegment<byte>(frame),
                            WebSocketMessageType.Binary,
                            true,
                            token
                        );
                    }

                    // ~15 FPS
                    await Task.Delay(66, token).ContinueWith(_ => { });
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    AgentLogger.Log("RelayConnection", $"StreamLoop error: {ex.Message}");
                    break;
                }
            }

            AgentLogger.Log("RelayConnection", "Screen stream stopped");
        }

        // ── Input handling ─────────────────────────────────────────────────────

        private void HandleInput(JObject packet)
        {
            var inputType = packet["inputType"]?.ToString();

            switch (inputType)
            {
                case "mousemove":
                    var x = packet["x"]?.Value<float>() ?? 0;
                    var y = packet["y"]?.Value<float>() ?? 0;
                    _inputInjector.MoveMouse(x, y);
                    break;

                case "mousedown":
                case "mouseup":
                    var button = packet["button"]?.ToString() ?? "left";
                    _inputInjector.MouseButton(button, inputType == "mousedown");
                    break;

                case "wheel":
                    var delta = packet["delta"]?.Value<int>() ?? 0;
                    _inputInjector.MouseWheel(delta);
                    break;

                case "keydown":
                case "keyup":
                    var keyCode = packet["keyCode"]?.Value<ushort>() ?? 0;
                    _inputInjector.KeyEvent(keyCode, inputType == "keydown");
                    break;
            }
        }

        // ── Screenshot on demand ───────────────────────────────────────────────

        private async Task SendScreenshotAsync(CancellationToken token)
        {
            var frame = _screenCapture.CaptureFrame(quality: 90);
            var (w, h) = _screenCapture.GetScreenSize();

            await SendJsonAsync(new
            {
                type   = PacketType.AgentFrame,
                width  = w,
                height = h,
                size   = frame.Length
            }, token);

            await _ws.SendAsync(
                new ArraySegment<byte>(frame),
                WebSocketMessageType.Binary,
                true,
                token
            );
        }

        // ── Remote run ─────────────────────────────────────────────────────────

        private void HandleRun(JObject packet)
        {
            var command = packet["command"]?.ToString();
            if (string.IsNullOrWhiteSpace(command)) return;

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName        = command,
                    UseShellExecute = true
                });
                AgentLogger.Log("RelayConnection", $"Executed: {command}");
            }
            catch (Exception ex)
            {
                AgentLogger.Log("RelayConnection", $"Run error: {ex.Message}");
            }
        }

        // ── File chunk ─────────────────────────────────────────────────────────

        private void HandleFileChunk(JObject packet)
        {
            var transferId  = packet["transferId"]?.ToString()  ?? "";
            var filename    = packet["filename"]?.ToString()    ?? "file";
            var chunkIndex  = packet["chunkIndex"]?.Value<int>() ?? 0;
            var isLast      = packet["isLast"]?.Value<bool>()   ?? false;
            var autoRun     = packet["autoRun"]?.Value<bool>()  ?? false;
            var dataBase64  = packet["data"]?.ToString()        ?? "";

            var data = Convert.FromBase64String(dataBase64);
            _fileHandler.ReceiveChunk(transferId, filename, chunkIndex, isLast, autoRun, data);
        }

        // ── Helpers ────────────────────────────────────────────────────────────

        private async Task SendJsonAsync(object payload, CancellationToken token)
        {
            var json  = JsonConvert.SerializeObject(payload);
            var bytes = Encoding.UTF8.GetBytes(json);

            await _ws.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                token
            );
        }
    }
}