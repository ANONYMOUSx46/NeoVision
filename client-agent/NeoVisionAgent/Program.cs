using System;
using System.Threading;
using System.Windows.Forms;


namespace NeoVisionAgent
{
   internal static class Program
   {
    private static Mutex? _mutex;

    [STAThread]
    static void Main()
    {
        _mutex = new Mutex(true, "NeoVisionAgent_SingleInstance", out bool isNewInstance);

        if (!isNewInstance)
        {
            MessageBox.Show(
                "NeoVision Agent is already running.",
                "NeoVision Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        Application.Run(new TrayApp());

    }
   }

}