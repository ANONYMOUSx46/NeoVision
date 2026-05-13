using System;
using System.IO;
using Newtonsoft.Json;

namespace NeoVisionAgent
{
    public class AgentConfig
    {
        public string RelayUrl                 { get; set; } = "wss://neovision-relay.onrender.com/ws";
        public string AgentVersion             { get; set; } = "1.0.0";
        public int    HeartbeatIntervalSeconds { get; set; } = 30;
        public int    ReconnectDelaySeconds    { get; set; } = 5;

        public static AgentConfig Load()
        {
            try
            {
                string configPath = Path.Combine(
                    AppDomain.CurrentDomain.BaseDirectory,
                    "config.json"
                );

                if (!File.Exists(configPath))
                {
                    AgentLogger.Log("Config", "config.json not found - using defaults");
                    return new AgentConfig();
                }

                string json = File.ReadAllText(configPath);
                AgentConfig result = JsonConvert.DeserializeObject<AgentConfig>(json);
                return result ?? new AgentConfig();
            }
            catch (Exception ex)
            {
                AgentLogger.Log("Config", "Failed to load config: " + ex.Message);
                return new AgentConfig();
            }
        }
    }
}