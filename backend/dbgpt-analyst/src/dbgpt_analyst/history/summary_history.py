
class SummaryHistoryManager:
    def __init__(self, session_id: str | None = None):
        self.session_id = session_id

    @classmethod
    def load_summary(cls, session_id):
        return ''

    @classmethod
    def save_summary(cls, session_id, summary):
        pass

    def get_context(self, window_size: int = 6) -> str:
        return self.load_summary(self.session_id) or ''

