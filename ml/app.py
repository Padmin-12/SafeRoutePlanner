"""
SafeRoutePlanner — ML & Routing Entrypoint (Backwards Compatible)
=================================================================
Imports the production Flask application from backend.app.
"""

from backend.app import app

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    print(f"\n SafeRoutePlanner API running on http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=True)