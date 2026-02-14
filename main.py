import customtkinter as ctk
import requests
import threading
import webbrowser
import json
import os
import time
from tkinter import filedialog, messagebox
from PIL import Image, ImageTk
from io import BytesIO

# Configuração Inicial
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class PixabayVideoDownloader(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Configurações da Janela
        self.title("Pixabay Video Downloader Pro")
        self.geometry("1100x800")
        
        # Variáveis de Estado
        self.api_key = ctk.StringVar(value=self.load_config("api_key", ""))
        self.query = ctk.StringVar(value="natureza")
        self.batch_delay = ctk.IntVar(value=3)
        self.auto_next_page = ctk.BooleanVar(value=True)
        
        self.current_page = 1
        self.videos_data = []
        self.downloaded_ids = self.load_history()
        self.is_batch_running = False
        self.stop_batch_event = threading.Event()

        # Layout Principal
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(1, weight=1)

        self.create_sidebar()
        self.create_main_area()
        self.create_footer()

    def create_sidebar(self):
        sidebar = ctk.CTkFrame(self, width=250, corner_radius=0)
        sidebar.grid(row=0, column=0, rowspan=3, sticky="nsew")
        sidebar.grid_rowconfigure(10, weight=1)

        # Título
        ctk.CTkLabel(sidebar, text="Configurações", font=ctk.CTkFont(size=20, weight="bold")).pack(pady=20, padx=20)

        # API Key
        ctk.CTkLabel(sidebar, text="API Key Pixabay:").pack(anchor="w", padx=20)
        self.entry_api = ctk.CTkEntry(sidebar, textvariable=self.api_key, show="*")
        self.entry_api.pack(fill="x", padx=20, pady=(0, 10))

        # Delay
        ctk.CTkLabel(sidebar, text="Delay (segundos):").pack(anchor="w", padx=20)
        self.entry_delay = ctk.CTkEntry(sidebar, textvariable=self.batch_delay)
        self.entry_delay.pack(fill="x", padx=20, pady=(0, 10))

        # Auto Next Page
        ctk.CTkCheckBox(sidebar, text="Auto-avançar Páginas", variable=self.auto_next_page).pack(anchor="w", padx=20, pady=10)

        ctk.CTkButton(sidebar, text="Salvar Config", command=self.save_api_config, fg_color="transparent", border_width=2).pack(fill="x", padx=20, pady=10)

        # Histórico Section
        ctk.CTkLabel(sidebar, text="Histórico", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=(30, 10), padx=20)
        self.lbl_history_count = ctk.CTkLabel(sidebar, text=f"{len(self.downloaded_ids)} vídeos salvos")
        self.lbl_history_count.pack(padx=20)

        ctk.CTkButton(sidebar, text="Exportar JSON", command=self.export_history).pack(fill="x", padx=20, pady=5)
        ctk.CTkButton(sidebar, text="Importar JSON", command=self.import_history).pack(fill="x", padx=20, pady=5)
        ctk.CTkButton(sidebar, text="Limpar Histórico", command=self.clear_history, fg_color="#ef4444", hover_color="#dc2626").pack(fill="x", padx=20, pady=(5, 20))

    def create_main_area(self):
        # Header (Busca)
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=1, sticky="ew", padx=20, pady=20)
        
        self.entry_search = ctk.CTkEntry(header, textvariable=self.query, placeholder_text="Buscar vídeos...", height=40, font=("Arial", 14))
        self.entry_search.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.entry_search.bind("<Return>", lambda e: self.search_videos(reset_page=True))

        ctk.CTkButton(header, text="Buscar", command=lambda: self.search_videos(reset_page=True), height=40, width=100).pack(side="right")

        # Scrollable Area para Resultados
        self.scroll_frame = ctk.CTkScrollableFrame(self, label_text="Resultados")
        self.scroll_frame.grid(row=1, column=1, sticky="nsew", padx=20, pady=(0, 20))
        self.scroll_frame.grid_columnconfigure((0, 1, 2), weight=1) # 3 colunas

    def create_footer(self):
        footer = ctk.CTkFrame(self, height=60, corner_radius=0)
        footer.grid(row=2, column=1, sticky="ew")

        # Controles de Paginação
        self.btn_prev = ctk.CTkButton(footer, text="< Anterior", command=lambda: self.change_page(-1), width=100, state="disabled")
        self.btn_prev.pack(side="left", padx=20, pady=15)

        self.lbl_page = ctk.CTkLabel(footer, text="Página 1", font=("Arial", 14, "bold"))
        self.lbl_page.pack(side="left", padx=10)

        self.btn_next = ctk.CTkButton(footer, text="Próxima >", command=lambda: self.change_page(1), width=100, state="disabled")
        self.btn_next.pack(side="left", padx=20)

        # Batch Controls
        self.btn_stop_batch = ctk.CTkButton(footer, text="Parar Lote", command=self.stop_batch_download, fg_color="#ef4444", hover_color="#dc2626", state="disabled")
        self.btn_stop_batch.pack(side="right", padx=20)

        self.btn_start_batch = ctk.CTkButton(footer, text="Baixar Tudo (Lote)", command=self.start_batch_download, fg_color="#10b981", hover_color="#059669")
        self.btn_start_batch.pack(side="right", padx=0)
        
        self.lbl_status = ctk.CTkLabel(footer, text="Pronto", text_color="gray")
        self.lbl_status.pack(side="right", padx=20)

    # --- Lógica de API ---

    def search_videos(self, reset_page=False):
        key = self.api_key.get()
        if not key:
            messagebox.showwarning("Aviso", "Por favor, configure sua API Key.")
            return

        if reset_page:
            self.current_page = 1
        
        self.lbl_status.configure(text="Buscando...")
        self.update_idletasks() # Força atualização da UI

        # Executa em thread para não travar a UI
        threading.Thread(target=self._fetch_thread, args=(key,)).start()

    def _fetch_thread(self, key):
        try:
            url = "https://pixabay.com/api/videos/"
            params = {
                "key": key,
                "q": self.query.get(),
                "page": self.current_page,
                "per_page": 50, # Reduzido um pouco para performance do Tkinter
                "safesearch": "true"
            }
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                self.videos_data = data.get("hits", [])
                
                # Agenda atualização da UI na main thread
                self.after(0, self.display_results)
            else:
                self.after(0, lambda: messagebox.showerror("Erro API", f"Erro: {response.status_code}"))
        except Exception as e:
            self.after(0, lambda: messagebox.showerror("Erro", str(e)))

    def display_results(self):
        # Limpar resultados anteriores
        for widget in self.scroll_frame.winfo_children():
            widget.destroy()

        if not self.videos_data:
            self.lbl_status.configure(text="Nenhum vídeo encontrado.")
            return

        self.lbl_page.configure(text=f"Página {self.current_page}")
        self.btn_prev.configure(state="normal" if self.current_page > 1 else "disabled")
        self.btn_next.configure(state="normal" if len(self.videos_data) >= 50 else "disabled")
        self.lbl_status.configure(text=f"{len(self.videos_data)} vídeos carregados.")

        # Grid System (3 colunas)
        row = 0
        col = 0
        
        for video in self.videos_data:
            self.create_video_card(video, row, col)
            col += 1
            if col > 2:
                col = 0
                row += 1

    def create_video_card(self, video, r, c):
        video_id = str(video['id'])
        is_downloaded = video_id in self.downloaded_ids
        
        # Container do Card
        card = ctk.CTkFrame(self.scroll_frame)
        card.grid(row=r, column=c, padx=10, pady=10, sticky="nsew")

        # Info Texto
        info_text = f"ID: {video['id']}\nDuração: {video['duration']}s\nTags: {video['tags'][:30]}..."
        lbl_info = ctk.CTkLabel(card, text=info_text, justify="left", font=("Arial", 12))
        lbl_info.pack(padx=10, pady=5, anchor="w")

        # Status Label
        status_color = "#10b981" if is_downloaded else "gray"
        status_text = "JÁ BAIXADO" if is_downloaded else "Disponível"
        lbl_status = ctk.CTkLabel(card, text=status_text, text_color=status_color, font=("Arial", 10, "bold"))
        lbl_status.pack(padx=10, anchor="w")

        # Botões
        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(fill="x", padx=5, pady=10)

        # Botão Download
        btn_dl = ctk.CTkButton(
            btn_frame, 
            text="Download 4K/Full",
            height=30,
            fg_color="#3b82f6" if not is_downloaded else "#334155",
            command=lambda v=video: self.download_video(v)
        )
        btn_dl.pack(side="left", fill="x", expand=True, padx=2)

        # Botão Link
        btn_link = ctk.CTkButton(
            btn_frame, 
            text="Ver", 
            width=50, 
            height=30,
            fg_color="#475569", 
            command=lambda url=video['pageURL']: webbrowser.open(url)
        )
        btn_link.pack(side="right", padx=2)

        # Tenta carregar thumbnail em thread separada para não travar
        threading.Thread(target=self.load_thumbnail, args=(video, card)).start()

    def load_thumbnail(self, video, card_widget):
        try:
            # Pega a imagem de preview pequena
            thumb_url = f"https://i.vimeocdn.com/video/{video['picture_id']}_295x166.jpg"
            response = requests.get(thumb_url, timeout=5)
            if response.status_code == 200:
                img_data = BytesIO(response.content)
                pil_image = Image.open(img_data)
                ctk_image = ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=(250, 140))
                
                # Inserir imagem no topo do card (usando after para thread safety)
                self.after(0, lambda: self._insert_image(card_widget, ctk_image))
        except:
            pass # Ignora falha na imagem

    def _insert_image(self, card, img):
        if card.winfo_exists():
            lbl_img = ctk.CTkLabel(card, text="", image=img)
            lbl_img.pack(side="top", pady=5, before=card.winfo_children()[0])

    # --- Lógica de Download ---

    def download_video(self, video, batch_mode=False):
        video_id = str(video['id'])
        
        # Prioriza resoluções
        v_url = video['videos'].get('large', {}).get('url') or \
                video['videos'].get('medium', {}).get('url') or \
                video['videos'].get('tiny', {}).get('url')
        
        if not v_url:
            if not batch_mode: messagebox.showerror("Erro", "URL de vídeo não encontrada.")
            return False

        filename = f"pixabay-{video_id}.mp4"
        
        # Se não for batch, pergunta onde salvar, se for batch, salva na pasta Downloads padrão
        if not batch_mode:
            save_path = filedialog.asksaveasfilename(defaultextension=".mp4", initialfile=filename)
            if not save_path: return False
        else:
            # Pasta Downloads do usuário
            downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
            save_path = os.path.join(downloads_path, filename)

        try:
            # Download stream
            with requests.get(v_url, stream=True) as r:
                r.raise_for_status()
                with open(save_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            
            self.add_to_history(video_id)
            if not batch_mode: messagebox.showinfo("Sucesso", f"Download concluído!\nSalvo em: {save_path}")
            return True
        except Exception as e:
            print(f"Erro download {video_id}: {e}")
            if not batch_mode: messagebox.showerror("Erro", f"Falha no download: {e}")
            return False

    def start_batch_download(self):
        if not self.videos_data:
            messagebox.showinfo("Info", "Faça uma busca primeiro.")
            return

        self.is_batch_running = True
        self.stop_batch_event.clear()
        self.btn_start_batch.configure(state="disabled")
        self.btn_stop_batch.configure(state="normal")
        
        threading.Thread(target=self._batch_process).start()

    def stop_batch_download(self):
        self.stop_batch_event.set()
        self.is_batch_running = False
        self.lbl_status.configure(text="Parando lote...")

    def _batch_process(self):
        has_more_pages = True
        
        while has_more_pages and not self.stop_batch_event.is_set():
            # Filtra não baixados
            to_download = [v for v in self.videos_data if str(v['id']) not in self.downloaded_ids]
            
            if not to_download and not self.auto_next_page.get():
                self.update_status("Todos desta página já baixados.")
                break

            total = len(to_download)
            for i, video in enumerate(to_download):
                if self.stop_batch_event.is_set(): break
                
                self.update_status(f"Lote: Baixando {i+1}/{total} (Pág {self.current_page})")
                
                success = self.download_video(video, batch_mode=True)
                
                if success:
                    # Pequeno delay visual para atualizar a UI
                    self.after(0, self.display_results)

                # Delay configurado
                if i < total - 1:
                    time.sleep(self.batch_delay.get())

            if self.stop_batch_event.is_set(): break

            # Paginação Automática
            if self.auto_next_page.get():
                self.update_status("Avançando para próxima página...")
                time.sleep(2)
                
                # Incrementa página e busca (sincrono aqui pois já estamos em thread)
                self.current_page += 1
                key = self.api_key.get()
                try:
                    url = "https://pixabay.com/api/videos/"
                    params = {"key": key, "q": self.query.get(), "page": self.current_page, "per_page": 50, "safesearch": "true"}
                    resp = requests.get(url, params=params)
                    data = resp.json()
                    
                    if not data.get("hits"):
                        has_more_pages = False
                        self.update_status("Fim dos resultados.")
                    else:
                        self.videos_data = data.get("hits")
                        self.after(0, self.display_results)
                        # Scroll to top (não tem método direto simples no ctk, ignoramos por enquanto)
                except Exception as e:
                    print(e)
                    has_more_pages = False
            else:
                has_more_pages = False

        self.is_batch_running = False
        self.after(0, lambda: self.btn_start_batch.configure(state="normal"))
        self.after(0, lambda: self.btn_stop_batch.configure(state="disabled"))
        if not self.stop_batch_event.is_set():
            self.update_status("Lote finalizado.")
        else:
            self.update_status("Lote interrompido pelo usuário.")

    def update_status(self, text):
        self.after(0, lambda: self.lbl_status.configure(text=text))

    def change_page(self, delta):
        self.current_page += delta
        if self.current_page < 1: self.current_page = 1
        self.search_videos()

    # --- Persistência e Config ---

    def load_config(self, key, default):
        try:
            if os.path.exists("config.json"):
                with open("config.json", "r") as f:
                    return json.load(f).get(key, default)
        except: pass
        return default

    def save_api_config(self):
        cfg = {"api_key": self.api_key.get()}
        with open("config.json", "w") as f:
            json.dump(cfg, f)
        messagebox.showinfo("Salvo", "Configurações salvas localmente.")

    def load_history(self):
        if os.path.exists("pixabay_history.json"):
            try:
                with open("pixabay_history.json", "r") as f:
                    return set(json.load(f))
            except: return set()
        return set()

    def add_to_history(self, video_id):
        self.downloaded_ids.add(str(video_id))
        self.lbl_history_count.configure(text=f"{len(self.downloaded_ids)} vídeos salvos")
        with open("pixabay_history.json", "w") as f:
            json.dump(list(self.downloaded_ids), f)

    def export_history(self):
        path = filedialog.asksaveasfilename(defaultextension=".json", initialfile="pixabay_history.json")
        if path:
            with open(path, "w") as f:
                json.dump(list(self.downloaded_ids), f)
            messagebox.showinfo("Exportar", "Histórico exportado com sucesso.")

    def import_history(self):
        path = filedialog.askopenfilename(filetypes=[("JSON Files", "*.json")])
        if path:
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                    self.downloaded_ids.update(set(data))
                    self.add_to_history("dummy") # trigger save and update label logic (hacky but works)
                    # remove dummy
                    self.downloaded_ids.remove("dummy")
                    self.lbl_history_count.configure(text=f"{len(self.downloaded_ids)} vídeos salvos")
                self.display_results() # Refresh UI status
                messagebox.showinfo("Importar", "Histórico importado.")
            except Exception as e:
                messagebox.showerror("Erro", f"Erro ao importar: {e}")

    def clear_history(self):
        if messagebox.askyesno("Confirmar", "Tem certeza que deseja apagar o histórico?"):
            self.downloaded_ids = set()
            self.add_to_history("dummy") # trigger save
            self.downloaded_ids.remove("dummy")
            self.display_results()

if __name__ == "__main__":
    app = PixabayVideoDownloader()
    app.mainloop()