from flask import Flask, send_from_directory

app = Flask(__name__)


@app.get("/")
def home():
    return send_from_directory(".", "index.html")


@app.get("/logic")
def logic():
    return send_from_directory(".", "logic.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(".", "styles.css")


@app.get("/js/<path:filename>")
def js_files(filename):
    return send_from_directory("js", filename)


if __name__ == "__main__":
    app.run(debug=True)
