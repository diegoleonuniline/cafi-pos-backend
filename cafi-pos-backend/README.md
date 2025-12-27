# CAFI POS Backend

## Pasos para Deploy

### 1. GitHub
```bash
# Crear repo en GitHub: cafi-pos-backend
# En tu máquina local:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cafi-pos-backend.git
git push -u origin main
```

### 2. Heroku CLI
```bash
# Instalar Heroku CLI si no lo tienes
# https://devcenter.heroku.com/articles/heroku-cli

heroku login
heroku create cafi-pos-backend
# o con nombre específico:
heroku create tu-nombre-app
```

### 3. Variables de entorno en Heroku
```bash
heroku config:set SPREADSHEET_ID=1vRt9kIcJcAz9qR_jaF2hC6vWZoETOdc3oceQP-Cc6fI
heroku config:set APPSHEET_APP_ID=6d31d701-1278-4e8e-aefe-dfa42934844f
heroku config:set APPSHEET_API_KEY=V2-PvwFa-S9mop-1PPxo-LVX2P-yQKez-Y2zIw-g9ePc-xqiop
heroku config:set GOOGLE_CREDENTIALS='{"type":"service_account",...}'
heroku config:set BASE_URL=https://tu-app.herokuapp.com
```

### 4. Deploy
```bash
git push heroku main
```

### 5. Ver logs
```bash
heroku logs --tail
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login usuario |
| GET | /api/pos/cargar/:empresaID | Carga inicial POS |
| GET | /api/productos/:empresaID | Listar productos |
| POST | /api/productos | Crear producto |
| PUT | /api/productos/:id | Editar producto |
| DELETE | /api/productos/:id | Eliminar producto |
| GET | /api/clientes/:empresaID | Listar clientes |
| POST | /api/clientes | Crear cliente |
| POST | /api/ventas | Crear venta |
| GET | /api/ventas/hoy/:empresaID/:sucursalID | Resumen día |
| GET | /api/turnos/verificar/:e/:s/:u | Verificar turno |
| POST | /api/turnos/abrir | Abrir turno |
| POST | /api/turnos/cerrar | Cerrar turno |
