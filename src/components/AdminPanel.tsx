import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import {
  Search,
  ShieldCheck,
  Trash2,
  Download,
  KeyRound,
  Globe,
  MapPin,
  Cpu,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import {
  AuditLogEntry,
  CertificateCategory,
  CertificateRecord,
  buildCertificateRecord,
} from '../data/vaultStore';
import {
  ClientTelemetry,
  createEncryptedCertificatePdfBlob,
  decryptPayload,
} from '../utils/cryptoEngine';

interface AdminPanelProps {
  certificates: CertificateRecord[];
  auditLogs: AuditLogEntry[];
  telemetry: ClientTelemetry | null;
  onAddCertificates: (newCerts: CertificateRecord[], summaryText: string) => void;
  onDeleteCertificate: (cert: CertificateRecord) => void;
  onDownloadCertificate: (cert: CertificateRecord) => void;
  onRecordSearch: (query: string) => void;
  onInspectCipher: (targetCode: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  certificates,
  auditLogs,
  telemetry,
  onAddCertificates,
  onDeleteCertificate,
  onDownloadCertificate,
  onRecordSearch,
  onInspectCipher,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'documentos' | 'auditoria' | 'boveda'>('documentos');

  const [targetCedula, setTargetCedula] = useState('');
  const [holderName, setHolderName] = useState('');
  const [category, setCategory] = useState<CertificateCategory>('trabajo');
  const [title, setTitle] = useState('');
  const [roleOrProgram, setRoleOrProgram] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [editingCertForUrl, setEditingCertForUrl] = useState<CertificateRecord | null>(null);
  const [editUrlInput, setEditUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [docSearch, setDocSearch] = useState('');
  const [docCategoryFilter, setDocCategoryFilter] = useState<'todos' | 'trabajo' | 'estudio'>('todos');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>('TODOS');

  const [selectedCipherItem, setSelectedCipherItem] = useState<{
    code: string;
    sha256: string;
    cipherPayload: string;
    label: string;
  } | null>(null);

  const filteredCertificates = useMemo(() => {
    return certificates.filter((c) => {
      if (docCategoryFilter !== 'todos' && c.category !== docCategoryFilter) return false;
      if (docSearch.trim()) {
        const q = docSearch.toLowerCase();
        return (
          c.cedula.toLowerCase().includes(q) ||
          c.holderName.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.encryptedCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [certificates, docCategoryFilter, docSearch]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((entry) => {
      if (auditTypeFilter !== 'TODOS' && entry.actionType !== auditTypeFilter) return false;
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        return (
          entry.actorCedula.toLowerCase().includes(q) ||
          entry.actionSummary.toLowerCase().includes(q) ||
          entry.targetDetail.toLowerCase().includes(q) ||
          entry.ip.toLowerCase().includes(q) ||
          entry.location.toLowerCase().includes(q) ||
          entry.eventEncryptedCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, auditTypeFilter, auditSearch]);

  const showTransientMessage = (msg: string) => {
    setUploadStatusMsg(msg);
    setTimeout(() => {
      setUploadStatusMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleDownloadExcelTemplate = () => {
    const headers = [
      [
        'CEDULA',
        'NOMBRE_COMPLETO',
        'CARGO_O_PROGRAMA',
        'TIPO_CERTIFICADO',
        'TITULO_CERTIFICADO',
        'LINK_DESCARGA',
        'FECHA_EXPEDICION',
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 32 },
      { wch: 32 },
      { wch: 20 },
      { wch: 38 },
      { wch: 46 },
      { wch: 18 },
    ];

    const instructionsRows = [
      ['COLUMNA', 'DESCRIPCIÓN Y REGLAS DE CARGA'],
      [
        'CEDULA',
        'Número de cédula del titular (Obligatorio). Si varias filas tienen la misma cédula, todos esos certificados se agregan automáticamente al panel de esa persona.',
      ],
      [
        'NOMBRE_COMPLETO',
        'Nombres y apellidos del titular. Si la cédula ya está registrada o se repite en varias filas, se conserva automáticamente su nombre.',
      ],
      [
        'CARGO_O_PROGRAMA',
        'Cargo laboral o nombre del programa académico.',
      ],
      [
        'TIPO_CERTIFICADO',
        'Escriba "trabajo" para Certificados de Trabajo o "estudio" para Certificados de Estudio.',
      ],
      [
        'TITULO_CERTIFICADO',
        'Nombre o título del certificado que verá el usuario en su panel.',
      ],
      [
        'LINK_DESCARGA',
        'Enlace o URL (https://...) a donde será reenviado el usuario al pulsar "Link de descarga".',
      ],
      [
        'FECHA_EXPEDICION',
        'Opcional (formato AAAA-MM-DD). Si se deja en blanco se asigna la fecha actual.',
      ],
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows);
    instructionsSheet['!cols'] = [{ wch: 24 }, { wch: 95 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Certificados');
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');

    XLSX.writeFile(workbook, 'Plantilla_Certificados_ULEP.xlsx');
    showTransientMessage('Plantilla Excel descargada: Plantilla_Certificados_ULEP.xlsx');
  };

  const handleExcelFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        showTransientMessage('El archivo Excel no contiene hojas válidas.');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });

      if (rows.length === 0) {
        showTransientMessage(
          'La plantilla Excel está vacía. Agregue al menos una fila con datos.'
        );
        return;
      }

      // Mapa en memoria de personas existentes (por cédula) para que si una cédula se repite
      // en el Excel o ya existe en la plataforma, simplemente se agreguen los certificados a su panel.
      const personDirectory = new Map<
        string,
        { holderName: string; roleOrProgram: string }
      >();

      certificates.forEach((cert) => {
        if (!personDirectory.has(cert.cedula)) {
          personDirectory.set(cert.cedula, {
            holderName: cert.holderName,
            roleOrProgram: cert.roleOrProgram,
          });
        }
      });

      const today = new Date().toISOString().slice(0, 10);
      const createdRecords: CertificateRecord[] = [];
      const touchedCedulas = new Set<string>();

      const normalizeKey = (k: string) =>
        k
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[\s-]+/g, '_');

      rows.forEach((rawRow, rowIndex) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(rawRow).forEach(([key, val]) => {
          normalizedRow[normalizeKey(key)] = String(val ?? '').trim();
        });

        const rawCedula =
          normalizedRow['CEDULA'] ||
          normalizedRow['NUMERO_DE_CEDULA'] ||
          normalizedRow['NUMERO_CEDULA'] ||
          normalizedRow['DOCUMENTO'] ||
          normalizedRow['CC'] ||
          '';

        const cleanCedula = rawCedula.replace(/[^0-9]/g, '').trim();
        if (!cleanCedula) {
          return;
        }

        const rowName =
          normalizedRow['NOMBRE_COMPLETO'] ||
          normalizedRow['NOMBRES_Y_APELLIDOS'] ||
          normalizedRow['NOMBRE'] ||
          normalizedRow['TITULAR'] ||
          '';

        const rowRole =
          normalizedRow['CARGO_O_PROGRAMA'] ||
          normalizedRow['CARGO'] ||
          normalizedRow['PROGRAMA'] ||
          normalizedRow['DEPENDENCIA'] ||
          '';

        const rawCategory = (
          normalizedRow['TIPO_CERTIFICADO'] ||
          normalizedRow['TIPO'] ||
          normalizedRow['CATEGORIA'] ||
          'trabajo'
        ).toLowerCase();

        const resolvedCategory: CertificateCategory =
          rawCategory.includes('est') ||
          rawCategory.includes('acad') ||
          rawCategory.includes('diplom') ||
          rawCategory.includes('curso')
            ? 'estudio'
            : 'trabajo';

        const rawTitle =
          normalizedRow['TITULO_CERTIFICADO'] ||
          normalizedRow['TITULO'] ||
          normalizedRow['CERTIFICADO'] ||
          normalizedRow['NOMBRE_CERTIFICADO'] ||
          '';

        const rawLink =
          normalizedRow['LINK_DESCARGA'] ||
          normalizedRow['LINK'] ||
          normalizedRow['URL'] ||
          normalizedRow['ENLACE'] ||
          '';

        const rawDate =
          normalizedRow['FECHA_EXPEDICION'] ||
          normalizedRow['FECHA'] ||
          '';

        const existingPerson = personDirectory.get(cleanCedula);

        const resolvedHolderName =
          rowName ||
          existingPerson?.holderName ||
          `Titular C.C. ${cleanCedula}`;

        const resolvedRole =
          rowRole ||
          existingPerson?.roleOrProgram ||
          (resolvedCategory === 'trabajo'
            ? 'Profesional Corporativo'
            : 'Programa de Formación Académica ULEP');

        // Actualizar o registrar la persona en el directorio para siguientes filas con la misma cédula
        personDirectory.set(cleanCedula, {
          holderName: resolvedHolderName,
          roleOrProgram: resolvedRole,
        });

        const resolvedTitle =
          rawTitle ||
          (resolvedCategory === 'trabajo'
            ? 'Certificación Laboral'
            : 'Certificado de Estudio');

        const record = buildCertificateRecord({
          id: `CRT-${Date.now()}-${rowIndex}-${Math.random()
            .toString(36)
            .slice(2, 6)
            .toUpperCase()}`,
          cedula: cleanCedula,
          holderName: resolvedHolderName,
          category: resolvedCategory,
          title: resolvedTitle,
          roleOrProgram: resolvedRole,
          issueDate: rawDate || today,
          downloadUrl: rawLink || undefined,
          worksInCompany: true,
          studiedInCompany: true,
        });

        createdRecords.push(record);
        touchedCedulas.add(cleanCedula);
      });

      if (createdRecords.length === 0) {
        showTransientMessage(
          'No se encontraron filas con número de cédula válido en el archivo Excel.'
        );
        return;
      }

      onAddCertificates(
        createdRecords,
        `Carga masiva desde Excel (${file.name}): ${createdRecords.length} certificado(s) agregados a ${touchedCedulas.size} cédula(s)`
      );

      showTransientMessage(
        `Plantilla procesada: se agregaron ${createdRecords.length} certificado(s) correspondientes a ${touchedCedulas.size} cédula(s).`
      );
    } catch {
      showTransientMessage(
        'Error al leer el archivo Excel. Verifique que sea un archivo .xlsx, .xls o .csv válido.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveEditedUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCertForUrl) return;

    const updatedCert: CertificateRecord = {
      ...editingCertForUrl,
      downloadUrl: editUrlInput.trim() || undefined,
    };

    onAddCertificates(
      [updatedCert],
      `Actualización de link de descarga en admin para [${updatedCert.encryptedCode}]: ${editUrlInput.trim() || 'Link estándar PDF'}`
    );

    setEditingCertForUrl(null);
    setEditUrlInput('');
    showTransientMessage(`Link de descarga actualizado para ${updatedCert.encryptedCode}`);
  };

  const handleAdminDownload = (cert: CertificateRecord) => {
    onDownloadCertificate(cert);
    if (cert.customFileUrl) {
      const a = document.createElement('a');
      a.href = cert.customFileUrl;
      a.download = cert.customFileName || `${cert.encryptedCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const blob = createEncryptedCertificatePdfBlob({
      certificateTitle: cert.title,
      category: cert.category,
      holderName: cert.holderName,
      cedula: cert.cedula,
      roleOrProgram: cert.roleOrProgram,
      issueDate: cert.issueDate,
      encryptedCode: cert.encryptedCode,
      payloadCipher: cert.encryptedPayload,
      sha256Hash: cert.sha256Hash,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cert.encryptedCode}_${cert.cedula}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleExportAuditLog = () => {
    const jsonText = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_forense_ulep_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-8"
    >
      {/* Franja superior de métricas y telemetría de sesión activa en Blanco y Azul */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <p className="text-xs font-medium text-blue-700">Documentos Cifrados Activos</p>
          <p className="text-2xl font-bold text-[#1E3A8A] font-mono tabular-nums mt-1">
            {certificates.length}
          </p>
          <p className="text-xs text-blue-600/75 mt-1 font-mono tabular-nums">
            {certificates.filter((c) => c.category === 'trabajo').length} Trabajo ·{' '}
            {certificates.filter((c) => c.category === 'estudio').length} Estudio
          </p>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <p className="text-xs font-medium text-blue-700">Eventos en Auditoría Forense</p>
          <p className="text-2xl font-bold text-[#1E3A8A] font-mono tabular-nums mt-1">
            {auditLogs.length}
          </p>
          <p className="text-xs text-blue-600/75 mt-1 font-mono tabular-nums">
            {auditLogs.filter((a) => a.actionType === 'DESCARGA_CERTIFICADO').length} Descargas ·{' '}
            {auditLogs.filter((a) => a.actionType === 'BUSQUEDA').length} Búsquedas
          </p>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-blue-700">IP y Nodo de Red Detectado</p>
            <Globe className="w-3.5 h-3.5 text-[#2563EB]" />
          </div>
          <p className="text-lg font-bold text-[#1E3A8A] font-mono tabular-nums mt-1 truncate">
            {telemetry?.ip || '181.54.128.94'}
          </p>
          <p className="text-xs text-blue-600/75 mt-1 truncate">
            {telemetry?.isp || 'Red Segura Verificada'}
          </p>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-blue-700">Geolocalización de Trazabilidad</p>
            <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
          </div>
          <p className="text-sm font-bold text-[#1E3A8A] mt-1.5 truncate">
            {telemetry?.location || 'Bogotá D.C., CO'}
          </p>
          <p className="text-xs text-blue-600/75 font-mono tabular-nums mt-1 truncate">
            {telemetry?.coordinates || '4.7110° N, 74.0721° W'}
          </p>
        </div>
      </div>

      {/* Selector de sub-módulos del panel administrativo */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-200 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('documentos')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'documentos'
                ? 'bg-[#2563EB] text-white'
                : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
            }`}
          >
            <span className="material-symbols-outlined !text-base">person_add</span>
            <span>Registro de Personas y Certificados ({certificates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('auditoria')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'auditoria'
                ? 'bg-[#2563EB] text-white'
                : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
            }`}
          >
            <span className="material-symbols-outlined !text-base">policy</span>
            <span>Auditoría Forense de Trazabilidad ({auditLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('boveda')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'boveda'
                ? 'bg-[#2563EB] text-white'
                : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
            }`}
          >
            <span className="material-symbols-outlined !text-base">encrypted</span>
            <span>Inspector de Códigos Encriptados</span>
          </button>
        </div>

        <div className="text-xs font-mono tabular-nums text-blue-700 font-medium">
          ADMIN ULEP VERIFICADO · {telemetry?.sessionCipherId || 'SES-AES256'}
        </div>
      </div>

      {/* SUB-MÓDULO 1: REGISTRO DE PERSONAS Y ASIGNACIÓN DE CERTIFICADOS */}
      {activeSubTab === 'documentos' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Cuadro Principal: Verificación por Cédula -> Registro de Datos Personales (si no existe) o Agregar Otro Certificado + Link (si ya existe) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleanCedula = targetCedula.trim();
                if (!cleanCedula) {
                  showTransientMessage('Por favor ingrese el número de cédula.');
                  return;
                }
                const existingPersonCerts = certificates.filter(
                  (c) => c.cedula === cleanCedula
                );
                const personExists = existingPersonCerts.length > 0;

                const resolvedName = personExists
                  ? existingPersonCerts[0].holderName
                  : holderName.trim();

                if (!personExists && !resolvedName) {
                  showTransientMessage(
                    'La cédula no está registrada. Complete los datos personales del titular.'
                  );
                  return;
                }

                const cleanTitle =
                  title.trim() ||
                  (category === 'trabajo'
                    ? 'Certificación Laboral de Cargo y Vigencia'
                    : 'Certificado de Estudio y Aprobación Académica');
                const cleanRole = personExists
                  ? roleOrProgram.trim() || existingPersonCerts[0].roleOrProgram
                  : roleOrProgram.trim() ||
                    (category === 'trabajo'
                      ? 'Profesional de Planta Corporativa'
                      : 'Programa de Formación Académica ULEP');
                const cleanDownloadUrl = downloadUrl.trim() || undefined;

                const newCert = buildCertificateRecord({
                  cedula: cleanCedula,
                  holderName: resolvedName,
                  category,
                  title: cleanTitle,
                  roleOrProgram: cleanRole,
                  issueDate: new Date().toISOString().slice(0, 10),
                  downloadUrl: cleanDownloadUrl,
                  worksInCompany: true,
                  studiedInCompany: true,
                });

                onAddCertificates(
                  [newCert],
                  personExists
                    ? `Nuevo certificado agregado a titular existente C.C. ${cleanCedula} (${resolvedName}) [${newCert.encryptedCode}]`
                    : `Registro de nueva persona C.C. ${cleanCedula} (${resolvedName}) y emisión de certificado [${newCert.encryptedCode}]`
                );

                setTitle('');
                setDownloadUrl('');
                showTransientMessage(
                  personExists
                    ? `Certificado y link agregados exitosamente al expediente de ${resolvedName} (C.C. ${cleanCedula}).`
                    : `Persona registrada (${resolvedName}) y certificado emitido con código ${newCert.encryptedCode}.`
                );
              }}
              className="lg:col-span-7 bg-white border border-blue-200 rounded-xl p-6 flex flex-col justify-between space-y-5 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#1E3A8A] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#2563EB]">badge</span>
                    <span>Cuadro de Registro por Cédula y Certificados</span>
                  </h3>
                  <p className="text-xs text-blue-900/70 mt-0.5">
                    Ingrese el número de cédula: si ya está registrado solo agregue el certificado y el link; si no aparece, registre sus datos personales.
                  </p>
                </div>
              </div>

              {/* Paso 1: Ingresar Número de Cédula */}
              <div>
                <label className="block text-xs font-bold text-[#1E40AF] mb-1.5">
                  1. Número de Cédula a Consultar o Registrar
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined text-blue-500 absolute left-3.5 top-1/2 -translate-y-1/2 !text-lg">
                    id_card
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={targetCedula}
                    onChange={(e) =>
                      setTargetCedula(e.target.value.replace(/[^0-9]/g, ''))
                    }
                    placeholder="Escriba el número de cédula..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#F8FBFF] border border-blue-300 text-sm text-[#0F294A] font-mono tabular-nums placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB] focus:bg-white"
                  />
                </div>
              </div>

              {/* Evaluación dinámica de si la Cédula existe o no */}
              {(() => {
                const cleanCedula = targetCedula.trim();
                const matchedCerts = cleanCedula
                  ? certificates.filter((c) => c.cedula === cleanCedula)
                  : [];
                const isRegistered = matchedCerts.length > 0;
                const registeredPerson = matchedCerts[0];

                if (!cleanCedula) {
                  return (
                    <div className="rounded-xl bg-[#F4F9FF] border border-blue-200 p-5 text-center space-y-1.5">
                      <span className="material-symbols-outlined text-[#2563EB] !text-3xl">
                        person_search
                      </span>
                      <p className="text-sm font-semibold text-[#1E3A8A]">
                        Digite un número de cédula arriba para continuar
                      </p>
                      <p className="text-xs text-blue-700/75">
                        El sistema verificará instantáneamente si la persona ya existe en la base de datos cifrada.
                      </p>
                    </div>
                  );
                }

                if (isRegistered && registeredPerson) {
                  return (
                    <motion.div
                      key="existing-person-box"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Tarjeta de persona encontrada */}
                      <div className="rounded-xl bg-[#EAF4FF] border border-blue-300 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                            <span className="material-symbols-outlined !text-base">verified</span>
                            <span>PERSONA REGISTRADA ENCONTRADA</span>
                          </div>
                          <p className="text-base font-bold text-[#1E3A8A]">
                            {registeredPerson.holderName}
                          </p>
                          <p className="text-xs text-blue-800/80 font-mono tabular-nums">
                            C.C. {registeredPerson.cedula} · {registeredPerson.roleOrProgram}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-[#2563EB]">
                            {matchedCerts.length} certificado(s) actual(es)
                          </span>
                        </div>
                      </div>

                      {/* Solo agregar otro certificado y el link */}
                      <div className="rounded-xl bg-[#F8FBFF] border border-blue-200 p-4 space-y-3">
                        <p className="text-xs font-bold text-[#1E40AF] flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-base">note_add</span>
                          <span>2. Agregar Otro Certificado y Link de Descarga</span>
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                              Tipo de Certificado
                            </label>
                            <select
                              value={category}
                              onChange={(e) =>
                                setCategory(e.target.value as CertificateCategory)
                              }
                              className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] focus:outline-none focus:border-[#2563EB]"
                            >
                              <option value="trabajo">Certificado de Trabajo</option>
                              <option value="estudio">Certificado de Estudio</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                              Nombre / Título del Certificado
                            </label>
                            <input
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Título del certificado..."
                              className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                              Link de Descarga (URL a donde reenvía el botón)
                            </label>
                            <input
                              type="url"
                              value={downloadUrl}
                              onChange={(e) => setDownloadUrl(e.target.value)}
                              placeholder="https://..."
                              className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // Si la cédula NO aparece -> Mostrar cuadro de Registro de Datos Personales + Certificado y Link
                return (
                  <motion.div
                    key="new-person-box"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="rounded-xl bg-amber-50/90 border border-amber-300 p-3.5 flex items-center gap-2.5 text-xs text-amber-900">
                      <span className="material-symbols-outlined text-amber-600 !text-lg shrink-0">
                        person_add
                      </span>
                      <span>
                        La cédula <strong className="font-mono">{cleanCedula}</strong> no aparece registrada. Complete los <strong>datos personales</strong> para registrarla junto con su certificado y link.
                      </span>
                    </div>

                    <div className="rounded-xl bg-[#F8FBFF] border border-blue-200 p-4 space-y-3">
                      <p className="text-xs font-bold text-[#1E40AF] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-base">contact_page</span>
                        <span>2. Registro de Datos Personales</span>
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                            Nombres y Apellidos Completos *
                          </label>
                          <input
                            type="text"
                            required
                            value={holderName}
                            onChange={(e) => setHolderName(e.target.value)}
                            placeholder="Nombres y apellidos completos"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                            Cargo o Programa Académico *
                          </label>
                          <input
                            type="text"
                            value={roleOrProgram}
                            onChange={(e) => setRoleOrProgram(e.target.value)}
                            placeholder="Cargo o programa académico"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#F8FBFF] border border-blue-200 p-4 space-y-3">
                      <p className="text-xs font-bold text-[#1E40AF] flex items-center gap-1.5">
                        <span className="material-symbols-outlined !text-base">add_link</span>
                        <span>3. Asignar Certificado Inicial y Link de Descarga</span>
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                            Tipo de Certificado
                          </label>
                          <select
                            value={category}
                            onChange={(e) =>
                              setCategory(e.target.value as CertificateCategory)
                            }
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] focus:outline-none focus:border-[#2563EB]"
                          >
                            <option value="trabajo">Certificado de Trabajo (Empleado)</option>
                            <option value="estudio">Certificado de Estudio (Estudiante)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                            Título del Certificado
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Título del certificado..."
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-[#1E40AF] mb-1">
                            Link de Descarga (URL a donde reenvía el botón)
                          </label>
                          <input
                            type="url"
                            value={downloadUrl}
                            onChange={(e) => setDownloadUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              <AnimatePresence>
                {uploadStatusMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{uploadStatusMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!targetCedula.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined !text-base">save</span>
                <span>
                  {certificates.some((c) => c.cedula === targetCedula.trim())
                    ? 'Agregar Certificado y Link a esta Cédula'
                    : 'Registrar Persona y Guardar Certificado + Link'}
                </span>
              </button>
            </form>

            {/* Columna Derecha: 1. Descargar Plantilla Excel y 2. Subir Plantilla Excel con Certificados */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* SECCIÓN 1: DESCARGAR PLANTILLA EXCEL */}
              <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-blue-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-[#1E3A8A] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#2563EB]">
                        table_view
                      </span>
                      <span>Descargar Plantilla Excel</span>
                    </h3>
                    <p className="text-xs text-blue-900/75 mt-1 leading-relaxed">
                      Descargue el formato oficial en Excel para registrar múltiples certificados y enlaces de descarga.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-[#F4F9FF] border border-blue-200 p-3.5 text-xs text-blue-900/80 space-y-1.5">
                  <p className="font-bold text-[#1E40AF] flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-sm text-[#2563EB]">
                      info
                    </span>
                    <span>Columnas incluidas en la plantilla:</span>
                  </p>
                  <p className="font-mono text-[11px] text-[#1D4ED8] break-words">
                    CEDULA · NOMBRE_COMPLETO · CARGO_O_PROGRAMA · TIPO_CERTIFICADO · TITULO_CERTIFICADO · LINK_DESCARGA
                  </p>
                  <p className="text-[11px] text-blue-800/75">
                    Si varias filas tienen la <strong>misma cédula</strong>, todos sus certificados se suman automáticamente a su panel.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#EAF4FF] hover:bg-blue-100 border border-blue-300 text-[#1D4ED8] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="material-symbols-outlined !text-base">
                    download
                  </span>
                  <span>Descargar Plantilla Excel (.xlsx)</span>
                </button>
              </div>

              {/* SECCIÓN 2: SUBIR PLANTILLA EXCEL CON CERTIFICADOS */}
              <div className="bg-white border border-blue-200 rounded-xl p-6 flex-1 flex flex-col justify-between space-y-4 shadow-sm">
                <div className="border-b border-blue-100 pb-3">
                  <h3 className="text-base font-bold text-[#1E3A8A] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#2563EB]">
                      upload_file
                    </span>
                    <span>Subir Plantilla Excel con Certificados</span>
                  </h3>
                  <p className="text-xs text-blue-900/75 mt-1 leading-relaxed">
                    Suba el archivo Excel diligenciado. Si una cédula se repite en varias filas o ya existe, cada certificado y su link se agregan directamente al panel de ese titular.
                  </p>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleExcelFileUpload(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 min-h-[150px] rounded-xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-[#2563EB] bg-blue-50'
                      : 'border-blue-300 hover:border-[#2563EB] bg-[#F4F9FF]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleExcelFileUpload(e.target.files)}
                  />
                  <span className="material-symbols-outlined !text-4xl text-[#2563EB] mb-2">
                    drive_folder_upload
                  </span>
                  <p className="text-sm font-bold text-[#1E3A8A]">
                    Haga clic o arrastre su archivo Excel aquí
                  </p>
                  <p className="text-xs text-blue-600/80 mt-1">
                    Formatos soportados: .xlsx, .xls, .csv
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="material-symbols-outlined !text-base">
                    publish
                  </span>
                  <span>Seleccionar y Subir Plantilla Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Certificados Almacenados y Encriptados */}
          <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#1E3A8A]">
                  Repositorio de Certificados Cifrados
                </h3>
                <p className="text-xs text-blue-900/70">
                  Todos los registros están protegidos con código encriptado único y hash SHA-256.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (docSearch.trim()) onRecordSearch(`ADMIN_DOC: ${docSearch.trim()}`);
                  }}
                  className="relative"
                >
                  <Search className="w-3.5 h-3.5 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    onBlur={() => {
                      if (docSearch.trim()) onRecordSearch(`ADMIN_DOC: ${docSearch.trim()}`);
                    }}
                    placeholder="Buscar por cédula, titular o código..."
                    className="pl-8 pr-3 py-1.5 bg-[#F8FBFF] border border-blue-200 rounded-lg text-xs text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB] w-64"
                  />
                </form>

                <div className="flex items-center gap-1 p-1 bg-[#F4F9FF] border border-blue-200 rounded-lg">
                  {(['todos', 'trabajo', 'estudio'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDocCategoryFilter(cat)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md capitalize transition-colors cursor-pointer ${
                        docCategoryFilter === cat
                          ? 'bg-[#2563EB] text-white'
                          : 'text-blue-800/70 hover:text-[#1D4ED8]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-blue-100 bg-[#F4F9FF] text-xs text-[#1E40AF]">
                    <th className="py-3 px-4 font-semibold">Código Encriptado</th>
                    <th className="py-3 px-4 font-semibold">Cédula</th>
                    <th className="py-3 px-4 font-semibold">Titular</th>
                    <th className="py-3 px-4 font-semibold">Categoría</th>
                    <th className="py-3 px-4 font-semibold">Certificado</th>
                    <th className="py-3 px-4 font-semibold">Expedición</th>
                    <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100 text-sm">
                  {filteredCertificates.map((cert) => (
                    <tr
                      key={cert.id}
                      className="hover:bg-[#F4F9FF] transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums text-xs font-semibold text-[#2563EB] whitespace-nowrap">
                        {cert.encryptedCode}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-[#0F294A] whitespace-nowrap">
                        {cert.cedula}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-[#0F294A] whitespace-nowrap">
                        {cert.holderName}
                      </td>
                      <td className="py-3 px-4 text-xs text-blue-800 capitalize whitespace-nowrap">
                        {cert.category === 'trabajo' ? 'Trabajo · Laboral' : 'Estudio · Formación'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#0F294A] max-w-xs">
                        <div className="truncate font-medium">{cert.title}</div>
                        {cert.downloadUrl ? (
                          <div className="flex items-center gap-1 text-[11px] text-blue-600 truncate mt-0.5">
                            <Link2 className="w-3 h-3 shrink-0" />
                            <span className="truncate" title={cert.downloadUrl}>
                              {cert.downloadUrl}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-blue-700/80 whitespace-nowrap">
                        {cert.issueDate}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCertForUrl(cert);
                              setEditUrlInput(cert.downloadUrl || '');
                            }}
                            title="Configurar/modificar link de reenvío de descarga"
                            className={`text-xs font-semibold px-2 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                              cert.downloadUrl
                                ? 'bg-blue-100 text-[#1D4ED8] hover:bg-blue-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>{cert.downloadUrl ? 'Link Activo' : '+ Link'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onInspectCipher(cert.encryptedCode);
                              setSelectedCipherItem({
                                code: cert.encryptedCode,
                                sha256: cert.sha256Hash,
                                cipherPayload: cert.encryptedPayload,
                                label: `${cert.title} (C.C. ${cert.cedula})`,
                              });
                              setActiveSubTab('boveda');
                            }}
                            title="Ver código encriptado y hash SHA-256"
                            className="text-xs font-medium text-blue-600 hover:text-[#1D4ED8] transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAdminDownload(cert)}
                            title="Descargar PDF cifrado"
                            className="text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            <span>Descargar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteCertificate(cert)}
                            title="Eliminar certificado"
                            className="text-xs font-medium text-blue-400 hover:text-red-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCertificates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-blue-500">
                        No se encontraron certificados con ese criterio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MÓDULO 2: AUDITORÍA FORENSE DE TRAZABILIDAD TOTAL */}
      {activeSubTab === 'auditoria' && (
        <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-blue-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[#1E3A8A]">
                Registro Inmutable de Auditoría y Trazabilidad Forense
              </h3>
              <p className="text-xs text-blue-900/70">
                Monitoreo en tiempo real de inicios de sesión, búsquedas, descargas y subidas con dirección IP, ubicación geográfica, coordenadas y firma encriptada.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Filtrar por IP, ubicación, cédula..."
                  className="pl-8 pr-3 py-1.5 bg-[#F8FBFF] border border-blue-200 rounded-lg text-xs text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB] w-60"
                />
              </div>

              <select
                value={auditTypeFilter}
                onChange={(e) => setAuditTypeFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#F8FBFF] border border-blue-200 rounded-lg text-xs text-[#0F294A] focus:outline-none focus:border-[#2563EB]"
              >
                <option value="TODOS">Todas las acciones ({auditLogs.length})</option>
                <option value="DESCARGA_CERTIFICADO">Descargas de certificados</option>
                <option value="BUSQUEDA">Búsquedas realizadas</option>
                <option value="SUBIDA_AUTOMATICA">Subidas automáticas</option>
                <option value="LOGIN_USUARIO">Accesos de Usuarios</option>
                <option value="LOGIN_ADMIN">Accesos de Administrador</option>
                <option value="INTENTO_FALLIDO">Intentos fallidos</option>
              </select>

              <button
                type="button"
                onClick={handleExportAuditLog}
                className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Auditoría Cifrada</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-blue-100 bg-[#F4F9FF] text-xs text-[#1E40AF]">
                  <th className="py-3 px-4 font-semibold">Fecha / Hora</th>
                  <th className="py-3 px-4 font-semibold">Código Cifrado</th>
                  <th className="py-3 px-4 font-semibold">Cédula / Rol</th>
                  <th className="py-3 px-4 font-semibold">Acción Registrada</th>
                  <th className="py-3 px-4 font-semibold">Dirección IP</th>
                  <th className="py-3 px-4 font-semibold">Ubicación y Coordenadas</th>
                  <th className="py-3 px-4 font-semibold">Dispositivo</th>
                  <th className="py-3 px-4 font-semibold text-right">Cifrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 text-xs">
                {filteredAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F4F9FF] transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-blue-700/80 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-[#2563EB] whitespace-nowrap">
                      {log.eventEncryptedCode}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#0F294A] whitespace-nowrap">
                      {log.actorCedula} · <span className="text-blue-600">{log.actorRole}</span>
                    </td>
                    <td className="py-3 px-4 text-[#0F294A] max-w-xs">
                      <p className="font-semibold text-[#1E3A8A]">{log.actionSummary}</p>
                      <p className="text-blue-800/75 truncate mt-0.5">{log.targetDetail}</p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                      {log.ip}
                    </td>
                    <td className="py-3 px-4 text-[#0F294A] whitespace-nowrap">
                      <p>{log.location}</p>
                      <p className="font-mono tabular-nums text-blue-600/75 text-[11px]">
                        {log.coordinates}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-blue-800/80 whitespace-nowrap">
                      {log.deviceSummary}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCipherItem({
                            code: log.eventEncryptedCode,
                            sha256: log.sha256Signature,
                            cipherPayload: log.eventCipherPayload,
                            label: `Evento Auditoría: ${log.actionSummary} (${log.timestamp})`,
                          });
                          setActiveSubTab('boveda');
                        }}
                        className="text-[#2563EB] hover:text-[#1D4ED8] font-mono font-bold underline underline-offset-4 cursor-pointer"
                      >
                        Verificar Hash
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-blue-500">
                      No hay registros de auditoría que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-MÓDULO 3: INSPECTOR DE CÓDIGOS ENCRIPTADOS Y VERIFICACIÓN DE INTEGRIDAD */}
      {activeSubTab === 'boveda' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-blue-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-base font-semibold text-[#1E3A8A]">
                  Registros Cifrados en Bóveda
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-blue-600">AES-256 / SHA-256</span>
            </div>

            <p className="text-xs text-blue-900/75">
              Seleccione cualquier certificado o registro de auditoría para inspeccionar su bloque encriptado en bruto y comprobar su integridad criptográfica.
            </p>

            <div className="divide-y divide-blue-100 max-h-[420px] overflow-y-auto pr-1">
              {certificates.map((cert) => (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() =>
                    setSelectedCipherItem({
                      code: cert.encryptedCode,
                      sha256: cert.sha256Hash,
                      cipherPayload: cert.encryptedPayload,
                      label: `${cert.title} — C.C. ${cert.cedula}`,
                    })
                  }
                  className={`w-full text-left py-3 px-3 rounded-lg transition-colors cursor-pointer ${
                    selectedCipherItem?.code === cert.encryptedCode
                      ? 'bg-[#EAF4FF] text-[#1E3A8A]'
                      : 'hover:bg-[#F4F9FF] text-[#0F294A]'
                  }`}
                >
                  <p className="text-xs font-mono tabular-nums text-[#2563EB] font-bold">
                    {cert.encryptedCode}
                  </p>
                  <p className="text-xs font-medium text-[#0F294A] truncate mt-0.5">{cert.title}</p>
                  <p className="text-[11px] font-mono tabular-nums text-blue-600/70 mt-0.5">
                    Cédula Cifrada: {cert.cedulaCipher.slice(0, 28)}...
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-blue-200 rounded-xl p-6 space-y-5">
            {selectedCipherItem ? (
              <>
                <div className="flex items-center justify-between border-b border-blue-100 pb-4">
                  <div>
                    <p className="text-xs font-mono tabular-nums font-bold text-[#2563EB]">
                      CÓDIGO DE INTEGRIDAD: {selectedCipherItem.code}
                    </p>
                    <h4 className="text-base font-semibold text-[#1E3A8A] mt-1">
                      {selectedCipherItem.label}
                    </h4>
                  </div>
                  <Cpu className="w-5 h-5 text-[#2563EB]" />
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[#1E40AF] mb-1">
                      Firma Criptográfica de Integridad (SHA-256 Hex)
                    </p>
                    <div className="p-3 rounded-lg bg-[#F4F9FF] border border-blue-200 font-mono tabular-nums text-xs text-emerald-700 font-semibold break-all">
                      {selectedCipherItem.sha256}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#1E40AF] mb-1">
                      Bloque de Almacenamiento Encriptado (Ciphertext AES-256)
                    </p>
                    <div className="p-3 rounded-lg bg-[#F4F9FF] border border-blue-200 font-mono tabular-nums text-xs text-[#0F294A] break-all max-h-36 overflow-y-auto">
                      {selectedCipherItem.cipherPayload}
                    </div>
                  </div>

                  {(() => {
                    const verification = decryptPayload(selectedCipherItem.cipherPayload);
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-[#1E40AF]">
                            Verificación de Descifrado Autorizado (Tiempo Real)
                          </p>
                          <span className="text-xs font-mono font-bold text-emerald-700">
                            {verification.valid
                              ? 'CHECKSUM VÁLIDO · INTEGRIDAD 100%'
                              : 'ERROR DE INTEGRIDAD'}
                          </span>
                        </div>
                        <pre className="p-3 rounded-lg bg-[#F4F9FF] border border-blue-200 font-mono tabular-nums text-xs text-[#1D4ED8] overflow-x-auto">
                          {verification.valid
                            ? JSON.stringify(JSON.parse(verification.data), null, 2)
                            : 'No se pudo verificar el bloque'}
                        </pre>
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <div className="py-16 text-center space-y-2">
                <KeyRound className="w-8 h-8 text-blue-300 mx-auto" />
                <p className="text-sm font-semibold text-[#1E3A8A]">
                  Seleccione un código encriptado a la izquierda
                </p>
                <p className="text-xs text-blue-700/70">
                  Podrá auditar su bloque AES-256, su firma SHA-256 y la carga útil desencriptada.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para configurar o editar el link de descarga puesto en admin */}
      <AnimatePresence>
        {editingCertForUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white border border-blue-200 rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#2563EB]" />
                  <h4 className="text-base font-bold text-[#1E3A8A]">
                    Configurar Link de Descarga
                  </h4>
                </div>
                <span className="text-xs font-mono font-semibold text-[#2563EB]">
                  {editingCertForUrl.encryptedCode}
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#1E40AF]">Certificado:</p>
                <p className="text-sm text-[#0F294A] font-medium mt-0.5">
                  {editingCertForUrl.title}
                </p>
                <p className="text-xs text-blue-600/80 font-mono mt-0.5">
                  Titular: {editingCertForUrl.holderName} (C.C. {editingCertForUrl.cedula})
                </p>
              </div>

              <form onSubmit={handleSaveEditedUrl} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E40AF] mb-1.5">
                    URL de descarga / enlace de reenvío:
                  </label>
                  <input
                    type="url"
                    autoFocus
                    value={editUrlInput}
                    onChange={(e) => setEditUrlInput(e.target.value)}
                    placeholder="https://ejemplo.com/archivo-oficial.pdf o link de Drive/Bóveda"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#F8FBFF] border border-blue-200 text-sm text-[#0F294A] placeholder:text-blue-400 focus:outline-none focus:border-[#2563EB]"
                  />
                  <p className="text-[11px] text-blue-700/70 mt-1">
                    Al hacer clic en "Link de descarga" en el panel de usuario, el titular será reenviado automáticamente a esta dirección.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-blue-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCertForUrl(null);
                      setEditUrlInput('');
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  {editingCertForUrl.downloadUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditUrlInput('');
                        const updated: CertificateRecord = {
                          ...editingCertForUrl,
                          downloadUrl: undefined,
                        };
                        onAddCertificates([updated], `Removido link externo para ${updated.encryptedCode}`);
                        setEditingCertForUrl(null);
                        showTransientMessage('Link externo removido; vuelve a descarga PDF estándar.');
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      Quitar Link
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-sm"
                  >
                    Guardar Link
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
