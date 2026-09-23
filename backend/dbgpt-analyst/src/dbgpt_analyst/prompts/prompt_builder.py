
class PromptBuilder:
    """
    Dynamic Prompt Builder using XML tags.
    Helps construct prompts by assembling modular XML components.
    """
    def __init__(self, identity: str):
        self.identity = identity
        self.context: dict[str, str] = {}
        self.history: str = ""
        self.instructions: str = ""

    def add_context(self, tag_name: str, content: str) -> "PromptBuilder":
        """Add dynamic context inside the <context> block."""
        if content:
            self.context[tag_name] = content
        return self

    def set_history(self, history: str) -> "PromptBuilder":
        """Set the <conversation_history> block."""
        self.history = history
        return self

    def set_instructions(self, instructions: str) -> "PromptBuilder":
        """Set the <instructions> block."""
        self.instructions = instructions
        return self

    def build(self) -> str:
        """Assemble the final prompt with XML tags."""
        parts = []

        # 1. Identity
        parts.append("<identity>")
        parts.append(self.identity.strip())
        parts.append("</identity>\n")

        # 2. Context
        if self.context:
            parts.append("<context>")
            for tag, content in self.context.items():
                parts.append(f"  <{tag}>")
                parts.append(f"  {content.strip()}")
                parts.append(f"  </{tag}>\n")
            parts.append("</context>\n")

        # 3. History
        if self.history:
            parts.append("<conversation_history>")
            parts.append(self.history.strip())
            parts.append("</conversation_history>\n")

        # 4. Instructions
        if self.instructions:
            parts.append("<instructions>")
            parts.append(self.instructions.strip())
            parts.append("</instructions>")

        return "\n".join(parts)
