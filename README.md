# Sistema Web de Gestión de Inventario y Ventas — Botica Nova Salud (Red FarmaPlus)

**Curso:** Fullstack Developer Software — Tecnologías de la Información (`PIAD-527`)  
**Arquitectura:** Aplicación Web Tradicional Cliente-Servidor (**No-PWA**)  
**Stack Tecnológico:**
- **Backend:** Node.js + Express (`server.js`) con API RESTful y transacciones ACID
- **Base de Datos:** SQLite relacional persistente (`better-sqlite3` en modo WAL — `nova_salud.db`)
- **Frontend:** HTML5 Semántico (`public/index.html`), CSS3 con Design Tokens Clínicos (`public/base.css`, `public/style.css`) y JavaScript ES6+ (`public/app.js`)

---

## Estructura del Proyecto

```text
nova-salud-web/
├── package.json          # Dependencias (express, cors, better-sqlite3) y scripts
├── server.js             # Servidor Backend Node.js + Express + Endpoints REST + SQLite
├── nova_salud.db         # Base de datos relacional autogenerada con semilla realista
└── public/               # Frontend Web (HTML5 + CSS3 + JS ES6+)
    ├── index.html        # Interfaz web con 6 módulos operativos y modales in-page
    ├── base.css          # Reset accesible y variables base
    ├── style.css         # Sistema de diseño clínico-farmacéutico (Modo Claro y Oscuro)
    └── app.js            # Lógica cliente conectada a la API REST de Express
```

## Ejecución Local (VS Code / Terminal)

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Iniciar el servidor Node.js + Express:
   ```bash
   npm start
   ```
3. Abrir en el navegador web:
   ```text
   http://localhost:8000
   ```
*(Nota: Es una aplicación web pura — no incluye `manifest.json` ni `service-worker.js`)*
