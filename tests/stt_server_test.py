import contextlib
import io
import json
import sys
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

from scripts import stt_server


class WhisperServerTest(unittest.TestCase):
    def request(self, frame_sizes, transcription_error=None, disconnected=False):
        read_frames = []

        class PCM(bytes):
            def tobytes(self):
                return bytes(self)

        def frames(*, audio):
            self.assertEqual(audio, 0)
            for size in frame_sizes:
                read_frames.append(size)
                yield SimpleNamespace(samples=size, to_ndarray=lambda: PCM(size * 2))

        def segments():
            if transcription_error:
                raise RuntimeError(transcription_error)
            yield SimpleNamespace(text=" Hola ")

        transcribe = Mock(side_effect=lambda *a, **kw: (segments(), SimpleNamespace(language="es", duration=1)))
        container = SimpleNamespace(decode=frames)
        av = SimpleNamespace(open=lambda *a, **kw: contextlib.nullcontext(container),
                             AudioResampler=lambda **kw: SimpleNamespace(resample=lambda frame: [frame] if frame else []))
        numpy = SimpleNamespace(frombuffer=lambda raw, dtype: Samples(len(raw) // 2), int16=object(), float32=object())
        whisper = SimpleNamespace(WhisperModel=lambda *a, **kw: SimpleNamespace(transcribe=transcribe),
                                  decode_audio=lambda *a, **kw: Samples(sum(f.samples for f in frames(audio=0))))
        body = b'--test\r\nContent-Disposition: form-data; name="file"; filename="test.flac"\r\n\r\naudio\r\n--test--\r\n'
        request = (b"POST /v1/audio/transcriptions HTTP/1.0\r\nContent-Type: multipart/form-data; boundary=test\r\n"
                   + f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
        wire = io.BytesIO()
        output = io.StringIO()

        def send(data):
            if disconnected:
                raise BrokenPipeError
            wire.write(data)

        def serve():
            connection = SimpleNamespace(makefile=lambda *a, **kw: io.BytesIO(request), sendall=send)
            try:
                handler(connection, ("127.0.0.1", 0), server)
            except SystemExit as e:
                self.assertEqual(e.code, 1)
            except BrokenPipeError:
                pass

        def create_server(address, handler_type):
            nonlocal handler
            handler = handler_type
            return SimpleNamespace(serve_forever=serve)

        def exit_after_response(code):
            if not disconnected:
                self.assertIn(b"500 Internal Server Error", wire.getvalue())
                self.assertIn(transcription_error.encode(), wire.getvalue())
            raise SystemExit(code)

        handler = None
        server = None
        with (patch.dict(sys.modules, av=av, numpy=numpy, faster_whisper=whisper),
              patch.object(sys, "argv", ["stt_server.py", "--device", "cpu", "--max-seconds", "1"]),
              patch.object(stt_server, "ThreadingHTTPServer", create_server),
              patch.object(stt_server.os, "_exit", side_effect=exit_after_response) as exit_process,
              contextlib.redirect_stdout(output), contextlib.redirect_stderr(output)):
            stt_server.main()

        response = wire.getvalue()
        if response:
            headers, payload = response.split(b"\r\n\r\n", 1)
            response = (int(headers.split()[1]), json.loads(payload))
        return response, read_frames, transcribe, exit_process, output.getvalue()

    def test_stops_at_first_decoded_frame_over_limit(self):
        response, frames, transcribe, exit_process, _ = self.request([96000, 1, 160000])
        self.assertEqual(frames, [96000, 1])
        self.assertEqual(response, (413, {"error": "el audio dura 6 s y el máximo es 1 s"}))
        transcribe.assert_not_called()
        exit_process.assert_not_called()

    def test_keeps_audio_at_exact_limit(self):
        response, _, transcribe, exit_process, _ = self.request([96000])
        self.assertEqual(response, (200, {"text": "Hola", "language": "es", "duration": 1}))
        transcribe.assert_called_once()
        exit_process.assert_not_called()

    def test_lazy_cuda_error_exits_even_if_response_cannot_be_written(self):
        error = "CUDA failed with error out of memory"
        for disconnected in (False, True):
            with self.subTest(disconnected=disconnected):
                response, _, transcribe, exit_process, output = self.request([16000], error, disconnected)
                self.assertEqual(response, b"" if disconnected else (500, {"error": f"no se pudo transcribir: {error}"}))
                transcribe.assert_called_once()
                exit_process.assert_called_once_with(1)
                self.assertEqual(sum("reiniciando" in line for line in output.splitlines()), 1)

    def test_non_cuda_error_keeps_server_running(self):
        response, _, _, exit_process, _ = self.request([16000], "otro fallo")
        self.assertEqual(response, (500, {"error": "no se pudo transcribir: otro fallo"}))
        exit_process.assert_not_called()


class Samples:
    def __init__(self, size):
        self.size = size

    def __len__(self):
        return self.size

    def astype(self, dtype):
        return self

    def __truediv__(self, scale):
        return self
