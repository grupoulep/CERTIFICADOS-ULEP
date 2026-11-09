import { computeSha256Hex } from './cryptoEngine';

// Vector cifrado en memoria para validación de credenciales administrativas sin texto plano en el repositorio de GitHub
const PROTECTED_ADMIN_VECTOR = Object.freeze([156, 149, 151, 149, 144, 149, 150, 146, 146]);
const VECTOR_MASK = 0xa5;

function resolveProtectedVectorHash(domainSalt: string): string {
  const chars = PROTECTED_ADMIN_VECTOR.map((byte) => String.fromCharCode(byte ^ VECTOR_MASK)).join('');
  return computeSha256Hex(`${domainSalt}::${chars}`);
}

/**
 * Comparación en tiempo constante para mitigar ataques de temporización (Timing Attacks)
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifica si la cédula ingresada corresponde al administrador mediante hash SHA-256 en tiempo constante
 */
export function verifyAdminCedula(cedulaInput: string): boolean {
  const clean = cedulaInput.trim();
  if (!clean) return false;
  const candidateHash = computeSha256Hex(`ULEP_ADMIN_ID::${clean}`);
  const expectedHash = resolveProtectedVectorHash('ULEP_ADMIN_ID');
  return timingSafeEqualHex(candidateHash, expectedHash);
}

/**
 * Verifica si la contraseña ingresada corresponde a la clave administrativa mediante hash SHA-256 en tiempo constante
 */
export function verifyAdminPassword(passwordInput: string): boolean {
  const clean = passwordInput.trim();
  if (!clean) return false;
  const candidateHash = computeSha256Hex(`ULEP_ADMIN_KEY::${clean}`);
  const expectedHash = resolveProtectedVectorHash('ULEP_ADMIN_KEY');
  return timingSafeEqualHex(candidateHash, expectedHash);
}

/**
 * Obliga el uso de conexión segura HTTPS en producción (GitHub Pages / dominios personalizados)
 * y aplica blindaje de ejecución en el navegador contra inspección y extracción de código.
 */
export function enforceSecureDeploymentGuard(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // 1. Forzar redirección obligatoria a HTTPS en cualquier despliegue público (ej. GitHub Pages / dominio propio)
  const hostname = window.location.hostname;
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local');

  if (!isLocalhost && window.location.protocol === 'http:') {
    const secureUrl = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(secureUrl);
    return;
  }

  // 2. Limpiar cualquier parámetro sensible que pudiera pasarse por URL
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const sensitiveKeys = ['cedula', 'password', 'clave', 'token', 'key', 'admin'];
    let modified = false;
    sensitiveKeys.forEach((k) => {
      if (params.has(k)) {
        params.delete(k);
        modified = true;
      }
    });
    if (modified) {
      const cleanSearch = params.toString();
      const newUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, newUrl);
    }
  }

  // 3. Bloquear menú contextual (clic derecho) y arrastre de activos para proteger el contenido desplegado
  document.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
    },
    { capture: true }
  );

  document.addEventListener(
    'dragstart',
    (event) => {
      event.preventDefault();
    },
    { capture: true }
  );

  // 4. Bloquear atajos de teclado de inspección de código fuente y guardado de página (F12, Ctrl+U, Ctrl+S, Ctrl+Shift+I/J/C)
  window.addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toUpperCase();
      const ctrlOrMeta = event.ctrlKey || event.metaKey;

      const isF12 = event.key === 'F12';
      const isInspectShortcut =
        ctrlOrMeta && event.shiftKey && (key === 'I' || key === 'J' || key === 'C' || key === 'K');
      const isViewSourceOrSave = ctrlOrMeta && (key === 'U' || key === 'S');

      if (isF12 || isInspectShortcut || isViewSourceOrSave) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );

  // 5. Silenciar consola en compilaciones de producción para evitar fugas de estado en GitHub Pages
  if (import.meta.env.PROD) {
    const noop = () => undefined;
    try {
      console.log = noop;
      console.debug = noop;
      console.info = noop;
      console.table = noop;
    } catch {
      // Ignorar si el entorno congela console
    }
  }
}
