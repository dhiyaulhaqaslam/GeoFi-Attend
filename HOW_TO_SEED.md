SEED COMMAND
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/seed"

SEED SENDIRI:
Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:3001/api/attendance/admin/offices/1/radius" `
  -Headers @{ "user-id" = "1" } `
  -ContentType "application/json" `
  -Body (@{ radius_meters = 10 } | ConvertTo-Json)


CHECK SEED SUCCESS
Invoke-RestMethod -Method Get "http://localhost:3001/api/attendance/offices"

ATAU BISA CEK DI DATABASE LANGSUNG "attendance.db"