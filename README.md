# Gestao de Avarias

Este README resume como arrancar o backend e o frontend, e como testar rapidamente a ligacao.

## Requisitos
- Node.js 18+ (recomendado)
- NPM

## Backend
```powershell
cd .\backend
npm install
npm start
```
Servidor em http://127.0.0.1:3001

### Testes rapidos
Health check:
```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3001/ -Method GET
```
Login tecnico (exemplo):
```powershell
$body = @{ number='819'; pin='1234' } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3001/tech/login -Method POST -Body $body -ContentType 'application/json'
```

### Migrar PINs para hash (PBKDF2)
```powershell
cd .\backend
node .\scripts\migrate-pins.js
```

## Frontend
```powershell
cd .\frontend
npm install
npm run dev
```
Servidor em http://localhost:5173
