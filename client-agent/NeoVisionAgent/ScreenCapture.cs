using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace NeoVisionAgent
{
    /// <summary>
    /// Captures the screen and returns compressed JPEG frames.
    /// Uses GDI+ BitBlt — compatible with all Windows versions.
    /// </summary>
    public class ScreenCapture : IDisposable
    {
        private bool _disposed;

        /// <summary>
        /// Captures the entire primary screen and returns it as a
        /// compressed JPEG byte array ready to send over the WebSocket.
        /// </summary>
        /// <param name="quality">JPEG quality 1–100 (default 60)</param>
        public byte[] CaptureFrame(int quality = 60)
        {
            try
            {
                var bounds = Screen.PrimaryScreen?.Bounds
                    ?? new Rectangle(0, 0, 1920, 1080);

                using var bitmap = new Bitmap(bounds.Width, bounds.Height,
                    PixelFormat.Format32bppArgb);

                using (var graphics = Graphics.FromImage(bitmap))
                {
                    graphics.CopyFromScreen(
                        bounds.Location,
                        Point.Empty,
                        bounds.Size,
                        CopyPixelOperation.SourceCopy
                    );
                }

                // Encode as JPEG with the specified quality
                var encoderParams = new EncoderParameters(1);
                encoderParams.Param[0] = new EncoderParameter(
                    Encoder.Quality, (long)quality
                );

                var jpegCodec = GetJpegCodec();
                using var ms = new MemoryStream();
                bitmap.Save(ms, jpegCodec, encoderParams);
                return ms.ToArray();
            }
            catch (Exception ex)
            {
                AgentLogger.Log("ScreenCapture", $"CaptureFrame error: {ex.Message}");
                return Array.Empty<byte>();
            }
        }

        /// <summary>
        /// Returns screen dimensions as { width, height }.
        /// </summary>
        public (int Width, int Height) GetScreenSize()
        {
            var bounds = Screen.PrimaryScreen?.Bounds
                ?? new Rectangle(0, 0, 1920, 1080);
            return (bounds.Width, bounds.Height);
        }

        private static ImageCodecInfo GetJpegCodec()
        {
            foreach (var codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.MimeType == "image/jpeg")
                    return codec;
            }
            throw new InvalidOperationException("JPEG codec not found.");
        }

        public void Dispose()
        {
            _disposed = true;
            GC.SuppressFinalize(this);
        }
    }
}