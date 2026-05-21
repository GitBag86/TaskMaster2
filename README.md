# TaskMaster2 - Task Management Application

A full-stack task management application with a Flask REST API backend and React/TypeScript SPA frontend. Features include task management, subtasks, comments, real-time updates via Socket.IO, dark mode, and PWA support.

## Quick Start (Docker Desktop)

### Prerequisites
- Docker Desktop installed and running
- Git (to clone the repo)

### Deploy Locally

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd TaskMaster2
   ```

2. **Start the application**
   ```bash
   docker-compose up --build
   ```

   First run will:
   - Build the Docker image
   - Initialize the SQLite database
   - Run migrations automatically
   - Start the application on `http://localhost:5000`

3. **Access the app**
   - Open your browser to **`http://localhost:5000`**
   - Create an account (first user auto-becomes admin)
   - Start managing tasks!

### Stopping the Application
```bash
docker-compose down
```

### Configuration

Edit `.env` to customize:
- `SECRET_KEY` - Session encryption key (regenerate with: `python -c 'import secrets; print(secrets.token_hex(32))'`)
- `CORS_ORIGINS` - Allowed origins (e.g., `http://localhost:5000`)
- `MAIL_SERVER` - Email settings (optional)
- `ENABLE_SCHEDULER` - Enable background jobs (default: true)

### Database

- **SQLite** (default): Data persisted in `instance/tasks.db` and Docker volume `db-data`
- To reset database: `docker-compose down -v` then restart

## Architecture

### Backend (Flask)
- REST API with Marshmallow validation
- SQLAlchemy ORM with Flask-Migrate
- Socket.IO for real-time updates
- Role-based access control (admin/user)
- Session-based authentication

### Frontend (React)
- TypeScript + Vite
- Tailwind CSS with dark mode
- Context API for state management
- Lazy-loaded routes
- PWA support

### Real-Time Sync
Any task modification automatically syncs to all connected clients via Socket.IO.

## Development

### Backend Development
```bash
# Install Python dependencies
pip install -r requirements.txt

# Run Flask dev server (port 5000)
python app.py
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev    # Vite dev server on port 3000 (proxies to Flask :5000)
```

### Run Tests
```bash
pytest
```

## Key Endpoints

- `GET /` - Serve frontend
- `POST /auth/signup` - Register
- `POST /auth/login` - Login
- `GET/POST/PATCH/DELETE /tasks` - Task operations
- `/health` - Health check
- `/ready` - Readiness check

## Customization

### Add Email Notifications
Update `.env` with SMTP details:
```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
MAIL_DEFAULT_SENDER=noreply@taskmaster.app
ENABLE_SCHEDULER=true
```

### Change Port
Edit `docker-compose.yml` (change `5000:5000` to desired ports) and `.env` (update `CORS_ORIGINS`).

## Troubleshooting

**Port 5000 already in use:**
- Change port in `docker-compose.yml` and update `CORS_ORIGINS` in `.env`

**Frontend not loading:**
- Ensure build completed: `docker-compose up --build`
- Check browser console for errors
- Verify API connection in Network tab

**Database errors:**
- Reset database: `docker-compose down -v` then `docker-compose up --build`
- Check logs: `docker-compose logs web`

**Socket.IO not connecting:**
- Verify CORS_ORIGINS matches your URL
- Check browser console Network tab for connection attempts

## License

See LICENSE file for details.

## Support

For issues or questions, check:
- [AGENTS.md](AGENTS.md) - Architecture and patterns
- [.github/instructions/](.github/instructions/) - Domain-specific guidelines
- [.github/skills/](.github/skills/) - Development skills and conventions
