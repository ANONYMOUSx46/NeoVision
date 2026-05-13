using System;
using System.IO;

namespace NeoVisionAgent
{
    public static class AgentLogger
    {
        private static readonly string LogPath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "neovision-agent.log"
        );

        private static readonly object _lock = new object();

        public static void Log(string message)
        {
            try
            {
                lock (_lock)
                {
                    string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message;
                    File.AppendAllText(LogPath, line + Environment.NewLine);
                }
            }
            catch
            {
                // Never crash the agent due to logging failure
            }
        }

        public static void Log(string category, string message)
        {
            Log("[" + category + "] " + message);
        }
    }
}