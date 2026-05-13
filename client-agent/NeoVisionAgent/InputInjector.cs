using System;
using System.Runtime.InteropServices;

namespace NeoVisionAgent
{
    /// <summary>
    /// Injects mouse and keyboard input into Windows via SendInput API.
    /// </summary>
    public class InputInjector
    {
        #region Windows API

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;

        private const uint INPUT_MOUSE    = 0;
        private const uint INPUT_KEYBOARD = 1;

        private const uint MOUSEEVENTF_MOVE       = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        private const uint MOUSEEVENTF_WHEEL      = 0x0800;
        private const uint MOUSEEVENTF_ABSOLUTE   = 0x8000;

        private const uint KEYEVENTF_KEYDOWN = 0x0000;
        private const uint KEYEVENTF_KEYUP   = 0x0002;

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;

            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int    dx;
            public int    dy;
            public uint   mouseData;
            public uint   dwFlags;
            public uint   time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint   dwFlags;
            public uint   time;
            public IntPtr dwExtraInfo;
        }

        #endregion

        /// <summary>
        /// Moves the mouse to an absolute position on screen.
        /// x and y are normalised 0.0 to 1.0 values relative to screen size.
        /// </summary>
        public void MoveMouse(float normalizedX, float normalizedY)
        {
            try
            {
                int absX = (int)(normalizedX * 65535);
                int absY = (int)(normalizedY * 65535);

                var input = new INPUT
                {
                    type = INPUT_MOUSE,
                    U = new InputUnion
                    {
                        mi = new MOUSEINPUT
                        {
                            dx      = absX,
                            dy      = absY,
                            dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE
                        }
                    }
                };

                SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            }
            catch (Exception ex)
            {
                AgentLogger.Log("InputInjector", $"MoveMouse error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends a mouse button event. button is "left", "right", or "middle".
        /// </summary>
        public void MouseButton(string button, bool isDown)
        {
            try
            {
                uint flag = 0;

                if (button == "left")
                    flag = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
                else if (button == "right")
                    flag = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                else if (button == "middle")
                    flag = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;

                if (flag == 0) return;

                var input = new INPUT
                {
                    type = INPUT_MOUSE,
                    U = new InputUnion
                    {
                        mi = new MOUSEINPUT { dwFlags = flag }
                    }
                };

                SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            }
            catch (Exception ex)
            {
                AgentLogger.Log("InputInjector", $"MouseButton error: {ex.Message}");
            }
        }

        /// <summary>
        /// Scrolls the mouse wheel. delta positive = up, negative = down.
        /// </summary>
        public void MouseWheel(int delta)
        {
            try
            {
                var input = new INPUT
                {
                    type = INPUT_MOUSE,
                    U = new InputUnion
                    {
                        mi = new MOUSEINPUT
                        {
                            dwFlags   = MOUSEEVENTF_WHEEL,
                            mouseData = (uint)(delta * 120)
                        }
                    }
                };

                SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            }
            catch (Exception ex)
            {
                AgentLogger.Log("InputInjector", $"MouseWheel error: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends a keyboard key press or release using a Windows virtual key code.
        /// </summary>
        public void KeyEvent(ushort keyCode, bool isDown)
        {
            try
            {
                var input = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    U = new InputUnion
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk     = keyCode,
                            dwFlags = isDown ? KEYEVENTF_KEYDOWN : KEYEVENTF_KEYUP
                        }
                    }
                };

                SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
            }
            catch (Exception ex)
            {
                AgentLogger.Log("InputInjector", $"KeyEvent error: {ex.Message}");
            }
        }
    }
}