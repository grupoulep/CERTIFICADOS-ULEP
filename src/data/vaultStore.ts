import {
  computeSha256Hex,
  decryptPayload,
  encryptPayload,
  generateEncryptedCode,
  resolveClientTelemetry,
} from '../utils/cryptoEngine';

export type CertificateCategory = 'trabajo' | 'estudio';

export interface CertificateRecord {
  id: string;
  cedula: string;
  cedulaCipher: string;
  holderName: string;
  category: CertificateCategory;
  title: string;
  roleOrProgram: string;
  issueDate: string;
  encryptedCode: string;
  sha256Hash: string;
  encryptedPayload: string;
  customFileUrl?: string;
  customFileName?: string;
  downloadUrl?: string;
  worksInCompany: boolean;
  studiedInCompany: boolean;
}

export type AuditActionType =
  | 'LOGIN_USUARIO'
  | 'LOGIN_ADMIN'
  | 'INTENTO_FALLIDO'
  | 'BUSQUEDA'
  | 'DESCARGA_CERTIFICADO'
  | 'SUBIDA_AUTOMATICA'
  | 'ELIMINACION_DOCUMENTO'
  | 'INSPECCION_CIFRADO';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorCedula: string;
  actorRole: 'USUARIO' | 'ADMINISTRADOR' | 'ANONIMO';
  actionType: AuditActionType;
  actionSummary: string;
  targetDetail: string;
  ip: string;
  location: string;
  coordinates: string;
  isp: string;
  deviceSummary: string;
  eventEncryptedCode: string;
  eventCipherPayload: string;
  sha256Signature: string;
}

const STORAGE_CERTS_KEY = 'certivault_encrypted_certs_v2';
const STORAGE_AUDIT_KEY = 'certivault_encrypted_audit_v2';
const LEGACY_CERTS_KEY = 'certivault_encrypted_certs_v1';
const LEGACY_AUDIT_KEY = 'certivault_encrypted_audit_v1';

export function buildCertificateRecord(input: {
  id?: string;
  cedula: string;
  holderName: string;
  category: CertificateCategory;
  title: string;
  roleOrProgram: string;
  issueDate: string;
  customFileUrl?: string;
  customFileName?: string;
  downloadUrl?: string;
  worksInCompany: boolean;
  studiedInCompany: boolean;
}): CertificateRecord {
  const cleanCedula = input.cedula.trim();
  const id = input.id || `CRT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const seed = `${id}::${cleanCedula}::${input.category}::${input.title}::${input.issueDate}`;
  const encryptedCode = generateEncryptedCode(
    input.category === 'trabajo' ? 'ENC-TRB' : 'ENC-EST',
    seed
  );
  const sha256Hash = computeSha256Hex(seed);
  const cedulaCipher = encryptPayload(`CC:${cleanCedula}:${input.holderName}`);
  const rawPayloadJson = JSON.stringify({
    id,
    cedula: cleanCedula,
    holderName: input.holderName,
    category: input.category,
    title: input.title,
    roleOrProgram: input.roleOrProgram,
    issueDate: input.issueDate,
    encryptedCode,
    downloadUrl: input.downloadUrl,
  });
  const encryptedPayload = encryptPayload(rawPayloadJson);

  return {
    id,
    cedula: cleanCedula,
    cedulaCipher,
    holderName: input.holderName,
    category: input.category,
    title: input.title,
    roleOrProgram: input.roleOrProgram,
    issueDate: input.issueDate,
    encryptedCode,
    sha256Hash,
    encryptedPayload,
    customFileUrl: input.customFileUrl,
    customFileName: input.customFileName,
    downloadUrl: input.downloadUrl,
    worksInCompany: input.worksInCompany,
    studiedInCompany: input.studiedInCompany,
  };
}

const INITIAL_CERTIFICATES: CertificateRecord[] = [];

export function loadCertificatesFromVault(): CertificateRecord[] {
  try {
    localStorage.removeItem(LEGACY_CERTS_KEY);
    const raw = localStorage.getItem(STORAGE_CERTS_KEY);
    if (!raw) {
      return INITIAL_CERTIFICATES;
    }
    const decrypted = decryptPayload(raw);
    if (decrypted.valid && decrypted.data) {
      const parsed = JSON.parse(decrypted.data) as CertificateRecord[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback vacío
  }
  return INITIAL_CERTIFICATES;
}

export function saveCertificatesToVault(records: CertificateRecord[]): void {
  try {
    const cipher = encryptPayload(JSON.stringify(records));
    localStorage.setItem(STORAGE_CERTS_KEY, cipher);
  } catch {
    // Ignorar error de cuota de almacenamiento
  }
}

export function ensureCertificatesForCedula(
  _cedula: string,
  currentList: CertificateRecord[]
): CertificateRecord[] {
  return currentList;
}

export function loadAuditLogsFromVault(): AuditLogEntry[] {
  try {
    localStorage.removeItem(LEGACY_AUDIT_KEY);
    const raw = localStorage.getItem(STORAGE_AUDIT_KEY);
    if (!raw) {
      return [];
    }
    const decrypted = decryptPayload(raw);
    if (decrypted.valid && decrypted.data) {
      const parsed = JSON.parse(decrypted.data) as AuditLogEntry[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback vacío
  }
  return [];
}

export function saveAuditLogsToVault(logs: AuditLogEntry[]): void {
  try {
    const cipher = encryptPayload(JSON.stringify(logs));
    localStorage.setItem(STORAGE_AUDIT_KEY, cipher);
  } catch {
    // Ignorar error
  }
}

export async function recordAuditEvent(params: {
  actorCedula: string;
  actorRole: 'USUARIO' | 'ADMINISTRADOR' | 'ANONIMO';
  actionType: AuditActionType;
  actionSummary: string;
  targetDetail: string;
}): Promise<AuditLogEntry> {
  const telemetry = await resolveClientTelemetry();
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const rawEventString = `${id}|${nowIso}|${params.actorCedula}|${params.actionType}|${telemetry.ip}|${telemetry.location}|${params.targetDetail}`;
  const eventEncryptedCode = generateEncryptedCode('AUD-ENC', rawEventString);
  const sha256Signature = computeSha256Hex(rawEventString);
  const eventCipherPayload = encryptPayload(
    JSON.stringify({
      id,
      timestamp: nowIso,
      actor: params.actorCedula,
      role: params.actorRole,
      action: params.actionType,
      detail: params.targetDetail,
      ip: telemetry.ip,
      location: telemetry.location,
      coordinates: telemetry.coordinates,
    })
  );

  const newEntry: AuditLogEntry = {
    id,
    timestamp: nowIso,
    actorCedula: params.actorCedula,
    actorRole: params.actorRole,
    actionType: params.actionType,
    actionSummary: params.actionSummary,
    targetDetail: params.targetDetail,
    ip: telemetry.ip,
    location: telemetry.location,
    coordinates: telemetry.coordinates,
    isp: telemetry.isp,
    deviceSummary: telemetry.deviceSummary,
    eventEncryptedCode,
    eventCipherPayload,
    sha256Signature,
  };

  const current = loadAuditLogsFromVault();
  const updated = [newEntry, ...current].slice(0, 250);
  saveAuditLogsToVault(updated);
  return newEntry;
}

export function parseDocumentFilenameAutomatically(
  fileName: string,
  fallbackCedula?: string
): {
  cedula: string;
  holderName: string;
  category: CertificateCategory;
  title: string;
  roleOrProgram: string;
} {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  const normalized = withoutExt.replace(/[_-]+/g, ' ').trim();
  const lower = normalized.toLowerCase();

  const digitMatch = normalized.match(/\b(\d{6,12})\b/);
  const cedula = digitMatch ? digitMatch[1] : fallbackCedula?.trim() || '';

  const isStudy =
    lower.includes('estudio') ||
    lower.includes('diploma') ||
    lower.includes('curso') ||
    lower.includes('academ') ||
    lower.includes('grado') ||
    lower.includes('certificado estudio');

  const category: CertificateCategory = isStudy ? 'estudio' : 'trabajo';

  const cleanWords = normalized
    .replace(/\b\d{6,12}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const title =
    cleanWords.length > 3
      ? cleanWords.charAt(0).toUpperCase() + cleanWords.slice(1)
      : category === 'trabajo'
      ? 'Certificado Laboral'
      : 'Certificado de Estudio';

  const holderName = cedula ? `Titular C.C. ${cedula}` : 'Titular Registrado';

  const roleOrProgram =
    category === 'trabajo'
      ? 'Vinculación Laboral Verificada'
      : 'Acreditación Académica Aprobada';

  return {
    cedula,
    holderName,
    category,
    title,
    roleOrProgram,
  };
}
