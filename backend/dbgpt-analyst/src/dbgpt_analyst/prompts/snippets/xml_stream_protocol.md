### Streaming XML Protocol
Use structured XML envelopes for stream separation:
- `<thought id="{{thought_id}}" status="complete">...</thought>`: Reasoning and plan formulation.
- `<sql dialect="{{dialect}}">...</sql>`: Generated database query.
- `<chart type="{{chart_type}}">...</chart>`: Chart spec payload.
- `<artifact type="{{artifact_type}}" title="{{title}}">...</artifact>`: Office documents (Excel, Word, Slide) or exportable deliverables.
- `<answer>...</answer>`: Final synthesized user-facing analytical narrative.
Always balance and close all opened XML tags cleanly.
