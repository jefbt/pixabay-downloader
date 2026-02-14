# pixabay-downloader
A batch downloader for pixabay videos

**Prerequisites**
- Python 3.8 or newer
- Install dependencies:

```bash
pip install -r requirements.txt
```

**Quick Start**

1. Add your Pixabay API key to `config.json` (or set it in the app sidebar):

```json
{"api_key": "YOUR_PIXABAY_API_KEY"}
```

2. Run the application:

```bash
python main.py
```

The GUI will open. The sidebar contains settings (API key, delay, auto page advance) and history controls.

**How to use**
- Search: enter search terms in the top input and press Enter or click **Buscar**.
- Single download: click **Download 4K/Full** on a video card and choose a save location.
- Batch download: click **Baixar Tudo (Lote)** to download unseen videos from the current results. Batch downloads save to your OS `Downloads` folder by default.
- History: the app stores downloaded IDs in `pixabay_history.json`. Use **Exportar JSON** / **Importar JSON** / **Limpar Histórico** from the sidebar.

**Configuration**
- `config.json` (in the project folder) must contain the `api_key` field. The app also lets you save the key from the sidebar using **Salvar Config**.
- `batch_delay` and `Auto-avançar Páginas` are set via the sidebar UI.

**Notes & Troubleshooting**
- If the app warns about a missing API key, add it to `config.json` or enter it in the sidebar and click **Salvar Config**.
- Required packages are listed in `requirements.txt`.
- If thumbnails fail to load, it won't prevent downloads (network or thumbnail CDN issues).

**Files**
- `main.py` — application entrypoint and GUI
- `config.json` — stores your `api_key`
- `pixabay_history.json` — saved download history (created automatically)

If you'd like, I can also add examples for automated runs or a small CLI wrapper.
