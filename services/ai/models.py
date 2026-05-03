"""
Model manager: handles first-run detection, model caching, config loading.
Models are stored in %APPDATA%/samvaad/models/ (Windows)
"""

import os
import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

class ModelManager:
    def __init__(self):
        self.data_dir  = self._get_data_dir()
        self.model_dir = self.data_dir / 'models'
        self.model_dir.mkdir(parents=True, exist_ok=True)

    def _get_data_dir(self) -> Path:
        app_data = os.environ.get('APPDATA') or os.environ.get('HOME', '.')
        return Path(app_data) / 'samvaad'

    def load_config(self) -> dict | None:
        config_file = self.data_dir / 'config.json'
        if config_file.exists():
            try:
                return json.loads(config_file.read_text())
            except Exception:
                return None
        return None

    def is_model_cached(self, model_name: str) -> bool:
        marker = self.model_dir / f'.{model_name}_done'
        return marker.exists()

    def mark_model_done(self, model_name: str):
        marker = self.model_dir / f'.{model_name}_done'
        marker.touch()

    def get_model_path(self, model_name: str) -> Path:
        return self.model_dir / model_name

    def get_whisper_model_dir(self) -> str:
        return str(self.model_dir / 'whisper')

    def get_pyannote_cache_dir(self) -> str:
        return str(self.model_dir / 'pyannote')

    def get_spacy_data_dir(self) -> str:
        return str(self.model_dir / 'spacy')
