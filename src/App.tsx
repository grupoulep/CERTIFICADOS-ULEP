/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { LogOut } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { UserPanel } from './components/UserPanel';
import { AdminPanel } from './components/AdminPanel';
import {
  AuditLogEntry,
  CertificateRecord,
  ensureCertificatesForCedula,
  loadAuditLogsFromVault,
  loadCertificatesFromVault,
  recordAuditEvent,
  saveCertificatesToVault,
} from './data/vaultStore';
import { ClientTelemetry, resolveClientTelemetry } from './utils/cryptoEngine';
import { AnimatedRibbons } from './components/AnimatedRibbons';

interface ActiveSession {
  cedula: string;
  isAdmin: boolean;
  activeView: 'usuario' | 'admin';
}

const ULEP_LOGO_URL = `${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`;

export default function App() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>(() =>
    loadCertificatesFromVault()
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    loadAuditLogsFromVault()
  );
  const [telemetry, setTelemetry] = useState<ClientTelemetry | null>(null);

  useEffect(() => {
    resolveClientTelemetry().then((data) => {
      setTelemetry(data);
    });
  }, []);

  const pushAuditEvent = useCallback(
    async (params: {
      actorCedula: string;
      actorRole: 'USUARIO' | 'ADMINISTRADOR' | 'ANONIMO';
      actionType: AuditLogEntry['actionType'];
      actionSummary: string;
      targetDetail: string;
    }) => {
      const entry = await recordAuditEvent(params);
      setAuditLogs(loadAuditLogsFromVault());
      return entry;
    },
    []
  );

  const handleSuccessLogin = (cedula: string, isAdmin: boolean) => {
    const updatedCerts = ensureCertificatesForCedula(cedula, certificates);
    setCertificates(updatedCerts);

    setSession({
      cedula,
      isAdmin,
      activeView: isAdmin ? 'admin' : 'usuario',
    });

    pushAuditEvent({
      actorCedula: cedula,
      actorRole: isAdmin ? 'ADMINISTRADOR' : 'USUARIO',
      actionType: isAdmin ? 'LOGIN_ADMIN' : 'LOGIN_USUARIO',
      actionSummary: isAdmin
        ? 'Inicio de sesión administrativo con doble clave verificado'
        : 'Inicio de sesión de titular con validación Captcha',
      targetDetail: `Acceso concedido al expediente C.C. ${cedula}`,
    });
  };

  const handleFailedAttempt = (cedula: string, reason: string) => {
    pushAuditEvent({
      actorCedula: cedula,
      actorRole: 'ANONIMO',
      actionType: 'INTENTO_FALLIDO',
      actionSummary: 'Intento de autenticación bloqueado en portada',
      targetDetail: reason,
    });
  };

  const handleLogout = useCallback(() => {
    setSession((currentSession) => {
      if (currentSession) {
        pushAuditEvent({
          actorCedula: currentSession.cedula,
          actorRole: currentSession.isAdmin ? 'ADMINISTRADOR' : 'USUARIO',
          actionType: currentSession.isAdmin ? 'LOGIN_ADMIN' : 'LOGIN_USUARIO',
          actionSummary: 'Cierre de sesión seguro',
          targetDetail: `Finalización de sesión para C.C. ${currentSession.cedula}`,
        });
      }
      return null;
    });
  }, [pushAuditEvent]);

  useEffect(() => {
    if (!session) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 7000);
    };

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
      'click',
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [session, handleLogout]);

  const handleRecordSearch = (query: string) => {
    if (!session) return;
    pushAuditEvent({
      actorCedula: session.cedula,
      actorRole: session.isAdmin ? 'ADMINISTRADOR' : 'USUARIO',
      actionType: 'BUSQUEDA',
      actionSummary: 'Búsqueda de certificados en plataforma',
      targetDetail: `Término consultado: "${query}"`,
    });
  };

  const handleRecordDownload = (cert: CertificateRecord) => {
    if (!session) return;
    pushAuditEvent({
      actorCedula: session.cedula,
      actorRole: session.isAdmin ? 'ADMINISTRADOR' : 'USUARIO',
      actionType: 'DESCARGA_CERTIFICADO',
      actionSummary: `Descarga de certificado (${cert.category.toUpperCase()})`,
      targetDetail: `${cert.title} · Código: ${cert.encryptedCode} · Titular C.C. ${cert.cedula}`,
    });
  };

  const handleAddCertificates = (
    newCerts: CertificateRecord[],
    summaryText: string
  ) => {
    const incomingIds = new Set(newCerts.map((c) => c.id));
    const remaining = certificates.filter((c) => !incomingIds.has(c.id));
    const updated = [...newCerts, ...remaining];
    setCertificates(updated);
    saveCertificatesToVault(updated);

    if (session) {
      pushAuditEvent({
        actorCedula: session.cedula,
        actorRole: 'ADMINISTRADOR',
        actionType: 'SUBIDA_AUTOMATICA',
        actionSummary: 'Subida e indexación automática de documentos cifrados',
        targetDetail: summaryText,
      });
    }
  };

  const handleDeleteCertificate = (cert: CertificateRecord) => {
    const updated = certificates.filter((c) => c.id !== cert.id);
    setCertificates(updated);
    saveCertificatesToVault(updated);

    if (session) {
      pushAuditEvent({
        actorCedula: session.cedula,
        actorRole: 'ADMINISTRADOR',
        actionType: 'ELIMINACION_DOCUMENTO',
        actionSummary: 'Revocación de certificado cifrado',
        targetDetail: `Eliminado ${cert.encryptedCode} (${cert.title} - C.C. ${cert.cedula})`,
      });
    }
  };

  const handleInspectCipher = (targetCode: string) => {
    if (!session) return;
    pushAuditEvent({
      actorCedula: session.cedula,
      actorRole: 'ADMINISTRADOR',
      actionType: 'INSPECCION_CIFRADO',
      actionSummary: 'Inspección de bloque encriptado AES-256 y firma SHA-256',
      targetDetail: `Verificación criptográfica del código ${targetCode}`,
    });
  };

  if (!session) {
    return (
      <LoginScreen
        onSuccessLogin={handleSuccessLogin}
        onFailedAttempt={handleFailedAttempt}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F9FF] text-[#0F294A] flex flex-col relative overflow-hidden">
      {/* Listones azules con animación de fondo */}
      <AnimatedRibbons />
      {/* Filtro SVG para mostrar el logo ULEP en azul institucional y azul celeste sobre fondos blancos */}
      <svg className="sr-only" aria-hidden="true">
        <defs>
          <filter id="ulep-header-blue" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="
                -0.92 0 1.03 0 0
                -1.19 0 1.49 0 0
                -0.44 0 1.29 0 0
                 0    0 0    1 0"
            />
          </filter>
        </defs>
      </svg>

      {/* Top Bar Contract: 3 zonas separadas por gap-8 en Blanco y Azul */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-blue-200 bg-white/95 backdrop-blur-md sticky top-0 z-30">
        {/* Zona 1: Brand Logo ULEP */}
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-3 whitespace-nowrap shrink-0"
        >
          <div className="w-28 h-10 overflow-hidden flex items-center justify-center">
            <img
              src={ULEP_LOGO_URL}
              alt="ULEP"
              referrerPolicy="no-referrer"
              style={{ filter: 'url(#ulep-header-blue)' }}
              className="w-full h-full object-contain scale-[2.2] select-none pointer-events-none"
            />
          </div>
        </a>

        {/* Zona 2: Enlaces de navegación en una sola línea */}
        <nav className="flex items-center gap-6 text-sm font-semibold text-blue-700/75">
          {session.isAdmin && (
            <button
              type="button"
              onClick={() =>
                setSession((prev) => (prev ? { ...prev, activeView: 'admin' } : null))
              }
              className={`hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                session.activeView === 'admin'
                  ? 'text-[#1D4ED8] underline underline-offset-8 decoration-[#2563EB] decoration-2'
                  : ''
              }`}
            >
              Panel Administrativo
            </button>
          )}
        </nav>

        {/* Zona 3 */}
        <div className="flex items-center gap-3 shrink-0">
        </div>
      </header>

      {/* Contenido Principal con animaciones en el fondo */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 relative z-10 overflow-hidden">
        {/* Capa de animaciones exclusivas de fondo para <main> */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none">
          {/* Resplandor radial azul superior con respiración suave */}
          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.35, 0.65, 0.35],
              x: [-20, 20, -20],
              y: [-10, 15, -10],
            }}
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -top-16 left-1/4 w-[420px] h-[320px] rounded-full bg-gradient-to-tr from-[#B4D9FF]/40 via-blue-400/20 to-transparent blur-3xl"
          />

          {/* Esfera flotante azul rey con movimiento orbital suave */}
          <motion.div
            animate={{
              x: [0, 60, -40, 0],
              y: [0, -45, 30, 0],
              scale: [0.9, 1.15, 0.95, 0.9],
              opacity: [0.25, 0.5, 0.3, 0.25],
            }}
            transition={{
              duration: 14,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute top-1/3 -right-20 w-[380px] h-[380px] rounded-full bg-gradient-to-bl from-blue-600/15 via-[#2563EB]/20 to-transparent blur-3xl"
          />

          {/* Listón ondulante azul celeste en la parte central-inferior del viewport */}
          <motion.div
            animate={{
              x: [-50, 40, -50],
              y: [20, -20, 20],
              rotate: [-6, 6, -6],
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute bottom-10 -left-28 w-[95%] h-32 rounded-[80px] bg-gradient-to-r from-blue-500/10 via-[#B4D9FF]/35 to-blue-600/15 blur-2xl transform origin-center"
          />

          {/* Partículas de destellos sutiles animados */}
          <motion.div
            animate={{
              opacity: [0.2, 0.7, 0.2],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute top-20 right-1/4 w-32 h-32 rounded-full bg-[#B4D9FF]/40 blur-xl"
          />
          <motion.div
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [1.1, 0.85, 1.1],
            }}
            transition={{
              duration: 7.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute bottom-24 left-1/3 w-36 h-36 rounded-full bg-blue-300/30 blur-xl"
          />
        </div>

        {session.activeView === 'usuario' ? (
          <UserPanel
            activeCedula={session.cedula}
            certificates={certificates}
            onRecordSearch={handleRecordSearch}
            onRecordDownload={handleRecordDownload}
          />
        ) : (
          <AdminPanel
            certificates={certificates}
            auditLogs={auditLogs}
            telemetry={telemetry}
            onAddCertificates={handleAddCertificates}
            onDeleteCertificate={handleDeleteCertificate}
            onDownloadCertificate={handleRecordDownload}
            onRecordSearch={handleRecordSearch}
            onInspectCipher={handleInspectCipher}
          />
        )}
      </main>
    </div>
  );
}
