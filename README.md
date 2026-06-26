# Personal Knowledge Curator (Phase 1 MVP)

**Description**  
The **Personal Knowledge Curator (PKC)** is an autonomous AI assistant designed to help users collect, summarize, and organize personal knowledge. Unlike traditional note-taking tools, the Curator actively processes user inputs, generates semantic tags, links related notes, and provides reflective insights.

This Phase 1 MVP allows a user to either paste full content or submit a URL (placeholder for now). The Curator agent then:

- Summarizes the content
- Generates semantic tags
- Stores notes in a PostgreSQL database with embeddings
- Suggests related notes via semantic search
- Optionally provides a mini-reflection on the user's knowledge growth

---

## **Key Features (Phase 1)**

- **Autonomous AI Agent:** The Curator decides what actions to take on new inputs.
- **Curator Personality:** Friendly, reflective, and thoughtful tone in summaries and reflections.
- **Semantic Organization:** Notes are linked by meaning using embeddings rather than folders or tags.
- **Flexible Input:** Users can paste text or provide a URL (manual for now).
- **Mini Reflection:** Optional feature summarizing trends in user notes.

---

## **Technical Stack**

| Layer                     | Technology / Library                    | Purpose |
|----------------------------|----------------------------------------|---------|
| **Frontend (UI)**          | Streamlit                               | Quick interface for input and visualization |
| **Backend**                | FastAPI                                 | API for note ingestion and agent communication |
| **Agent Framework**        | Strands                                 | Orchestrates summarization, tagging, embedding, and reasoning |
| **LLM**                    | OpenAI GPT-4o-mini                       | Summarization, tagging, reflective insights |
| **Database**               | PostgreSQL + pgvector                    | Store notes, embeddings, and enable semantic search |
| **Embeddings**             | OpenAI `text-embedding-3-large`         | Semantic similarity and linking |
| **Environment Management** | Python venv, dotenv                      | Isolated dev environment, API keys management |

---

## **Repository Structure**

