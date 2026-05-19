using System;
using System.Threading;
using System.Threading.Tasks;

namespace NeoVisionAgent
{
    public class AgentService
    {
        private readonly Action<string> _updateStatus;
        private CancellationTokenSource? _cts;
        private RelayConnection? _connection;
        private ScreenCapture? _screenCapture;
        private InputInjector? _inputInjector;
        private FileHandler? _fileHandler;
        private bool _running;

        public AgentService(Action<string> updateStatus)
        {
            _updateStatus = updateStatus;
        }

        public void Start()
        {
            if (_running) return;
            _running = true;
            _cts = new CancellationTokenSource();

            _screenCapture = new ScreenCapture();
            _inputInjector = new InputInjector();
            _fileHandler   = new FileHandler();

            Task.Run(() => RunLoop(_cts.Token));
        }

        public void Stop()
        {
            _running = false;
            _cts?.Cancel();
            _connection?.Disconnect();
            _screenCapture?.Dispose();
        }

        private async Task RunLoop(CancellationToken token)
        {
            AgentConfig config = AgentConfig.Load();

            while (!token.IsCancellationRequested)
            {
                try
                {
                    _updateStatus("Connecting...");

                    _connection = new RelayConnection(
                        config,
                        _screenCapture!,
                        _inputInjector!,
                        _fileHandler!,
                        _updateStatus
                    );

                    await _connection.ConnectAsync(token);

                    _updateStatus("Disconnected - reconnecting...");
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _updateStatus("Error - retrying...");
                    AgentLogger.Log("AgentService", "RunLoop error: " + ex.Message);
                }

                if (!token.IsCancellationRequested)
                {
                    try
                    {
                        await Task.Delay(
                            TimeSpan.FromSeconds(config.ReconnectDelaySeconds),
                            token
                        );
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }

            _updateStatus("Stopped");
        }
    }
}