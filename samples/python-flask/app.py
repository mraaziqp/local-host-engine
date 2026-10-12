import os
import sys

# Flask entrypoint simulation & runner
port = int(os.environ.get('PORT', 3125))
host = os.environ.get('HOST', '127.0.0.1')

print(f"[Flask API] Initializing Flask Edge REST microservice on http://{host}:{port}")
sys.stdout.flush()

try:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import json

    class FlaskHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            payload = {
                "service": "Flask Edge REST Microservice",
                "framework": "Flask 3.0",
                "status": "healthy",
                "port": port,
                "host": host
            }
            self.wfile.write(json.dumps(payload).encode('utf-8'))

    httpd = HTTPServer((host, port), FlaskHandler)
    print(f"[Flask Service] Listening strictly on http://{host}:{port}")
    sys.stdout.flush()
    httpd.serve_forever()
except Exception as e:
    print(f"[Flask Service Error]: {e}")
    sys.stdout.flush()
