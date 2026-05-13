using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace NeoVisionAgent
{
    public class TrayApp : ApplicationContext
    {
        private NotifyIcon? _trayIcon;
        private AgentService? _agentService;
        private ContextMenuStrip? _contextMenu;

        public TrayApp()
        {
            InitializeTrayIcon();
            StartAgentService();
        }

        private void InitializeTrayIcon()
        {
            _contextMenu = new ContextMenuStrip();

            ToolStripMenuItem headerItem = new ToolStripMenuItem("NeoVision Remote Support");
            headerItem.Enabled = false;
            headerItem.Font = new Font("Segoe UI", 9f, FontStyle.Bold);

            ToolStripMenuItem statusItem = new ToolStripMenuItem("Status: Connecting...");
            statusItem.Enabled = false;
            statusItem.Name = "statusItem";

            ToolStripSeparator separator1 = new ToolStripSeparator();

            ToolStripMenuItem aboutItem = new ToolStripMenuItem("About NeoVision");
            aboutItem.Click += OnAboutClicked;

            ToolStripSeparator separator2 = new ToolStripSeparator();

            ToolStripMenuItem uninstallItem = new ToolStripMenuItem("Uninstall NeoVision Agent");
            uninstallItem.ForeColor = Color.DarkRed;
            uninstallItem.Click += OnUninstallClicked;

            _contextMenu.Items.Add(headerItem);
            _contextMenu.Items.Add(statusItem);
            _contextMenu.Items.Add(separator1);
            _contextMenu.Items.Add(aboutItem);
            _contextMenu.Items.Add(separator2);
            _contextMenu.Items.Add(uninstallItem);

            _trayIcon = new NotifyIcon();
            _trayIcon.Text = "NeoVision Remote Support Agent";
            _trayIcon.Icon = SystemIcons.Shield;
            _trayIcon.ContextMenuStrip = _contextMenu;
            _trayIcon.Visible = true;
            _trayIcon.MouseDoubleClick += OnTrayIconDoubleClick;
        }

        private void StartAgentService()
        {
            _agentService = new AgentService(UpdateStatus);
            _agentService.Start();
        }

        public void UpdateStatus(string status)
        {
            if (_trayIcon == null || _contextMenu == null) return;

            if (_contextMenu.InvokeRequired)
            {
                _contextMenu.Invoke(new Action(() => UpdateStatus(status)));
                return;
            }

            ToolStripMenuItem? statusItem = _contextMenu.Items["statusItem"] as ToolStripMenuItem;
            if (statusItem != null)
            {
                statusItem.Text = "Status: " + status;
            }

            _trayIcon.Text = "NeoVision - " + status;
        }

        private void OnTrayIconDoubleClick(object? sender, MouseEventArgs e)
        {
            MessageBox.Show(
                "NeoVision Remote Support Agent is running.\n\n" +
                "This software allows your IT support team to\n" +
                "remotely assist you when needed.\n\n" +
                "Right-click the tray icon for options.",
                "NeoVision Remote Support",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }

        private void OnAboutClicked(object? sender, EventArgs e)
        {
            MessageBox.Show(
                "NeoVision Remote Support Agent\n" +
                "Version 1.0.0\n\n" +
                "This application allows your IT support team\n" +
                "to remotely view and assist with your computer.\n\n" +
                "To remove this software, right-click the tray icon\n" +
                "and select Uninstall.",
                "About NeoVision",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }

        private void OnUninstallClicked(object? sender, EventArgs e)
        {
            DialogResult result = MessageBox.Show(
                "Are you sure you want to uninstall NeoVision Remote Support Agent?\n\n" +
                "Your IT support team will no longer be able to assist you remotely.",
                "Uninstall NeoVision Agent",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );

            if (result == DialogResult.Yes)
            {
                try
                {
                    _agentService?.Stop();

                    if (_trayIcon != null)
                        _trayIcon.Visible = false;

                    string uninstallerPath = Path.Combine(
                        AppDomain.CurrentDomain.BaseDirectory,
                        "uninstall.bat"
                    );

                    if (File.Exists(uninstallerPath))
                    {
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName        = uninstallerPath,
                            UseShellExecute = true,
                            Verb            = "runas"
                        });
                    }

                    Application.Exit();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Uninstall failed: " + ex.Message,
                        "Uninstall Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _agentService?.Stop();
                _trayIcon?.Dispose();
                _contextMenu?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}