using System;
using System.IO;

namespace NeoVisionAgent
{
    public static class DeviceId
    {
        private static readonly string IdPath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "device.id"
        );

        public static string Get()
        {
            if (File.Exists(IdPath))
            {
                string stored = File.ReadAllText(IdPath).Trim();
                if (!string.IsNullOrEmpty(stored))
                    return stored;
            }

            string id = Guid.NewGuid().ToString();
            File.WriteAllText(IdPath, id);
            AgentLogger.Log("DeviceId", "Generated new device ID: " + id);
            return id;
        }
    }
}