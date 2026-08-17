# Deployment & Environment Architecture Guidelines

## Primary Source of Truth
- **Remote Store PC**: `shell@DESKTOP-PG2R9DJ` (`100.87.8.118`).
- **Production Cloud**: `https://backoffice-fancy-oyster-2gt.spcf.app/`
- **Local machine (`c:\Users\sandh\backoffice`)**: Backup and staging only. Files here should ONLY be updated after successful deployments and verifications on `pg2r9dj` and `https://backoffice-fancy-oyster-2gt.spcf.app/`.

## Sync Pipeline
- Real-time POS transaction files (`PJR...`, `FGM...`, etc.) originate on the local POS system on the store network (`\\10.5.48.2\XMLGateway\BOOutBox`).
- They are staged at `C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox` on `DESKTOP-PG2R9DJ`.
- The background agent (`C:\Users\shell\Documents\office\backoffice\local-agent`) uploads transactions over HTTPS to `/api/upload-xml` on the cloud app (`https://backoffice-fancy-oyster-2gt.spcf.app/api/upload-xml`).
