import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CertificateRecord } from '../data/vaultStore';
import { createEncryptedCertificatePdfBlob } from '../utils/cryptoEngine';

interface UserPanelProps {
  activeCedula: string;
  certificates: CertificateRecord[];
  onRecordSearch: (query: string) => void;
  onRecordDownload: (cert: CertificateRecord) => void;
}

export const UserPanel: React.FC<UserPanelProps> = ({
  activeCedula,
  certificates,
  onRecordSearch,
  onRecordDownload,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'trabajo' | 'estudio'>('todos');
  const [worksInCompany, setWorksInCompany] = useState(true);
  const [studiedInCompany, setStudiedInCompany] = useState(true);
  const [recentDownloadedId, setRecentDownloadedId] = useState<string | null>(null);

  const userCertificates = useMemo(() => {
    return certificates.filter((c) => c.cedula === activeCedula);
  }, [certificates, activeCedula]);

  const holderName =
    userCertificates[0]?.holderName || `Titular Verificado C.C. ${activeCedula}`;
  const holderCipherCode =
    userCertificates[0]?.cedulaCipher.slice(0, 32) || `AES256$${activeCedula}`;

  const filteredCertificates = useMemo(() => {
    return userCertificates.filter((cert) => {
      if (cert.category === 'trabajo' && !worksInCompany) return false;
      if (cert.category === 'estudio' && !studiedInCompany) return false;
      if (categoryFilter !== 'todos' && cert.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          cert.title.toLowerCase().includes(q) ||
          cert.encryptedCode.toLowerCase().includes(q) ||
          cert.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [userCertificates, worksInCompany, studiedInCompany, categoryFilter, searchQuery]);

  const workCerts = useMemo(
    () => filteredCertificates.filter((c) => c.category === 'trabajo'),
    [filteredCertificates]
  );
  const studyCerts = useMemo(
    () => filteredCertificates.filter((c) => c.category === 'estudio'),
    [filteredCertificates]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onRecordSearch(searchQuery.trim());
    }
  };

  const handleDownloadCertificate = (cert: CertificateRecord) => {
    onRecordDownload(cert);
    setRecentDownloadedId(cert.id);
    setTimeout(() => {
      setRecentDownloadedId((prev) => (prev === cert.id ? null : prev));
    }, 2500);

    if (cert.downloadUrl && cert.downloadUrl.trim()) {
      let finalUrl = cert.downloadUrl.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-5xl mx-auto space-y-8"
    >
      {/* Secciones de Certificados (solo con el link de descarga por certificado) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Columna 1: Certificados de Trabajo */}
        {(categoryFilter === 'todos' || categoryFilter === 'trabajo') && (
          <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#2563EB]">work</span>
                <h3 className="text-base font-semibold text-[#1E3A8A]">
                  Certificados de Trabajo
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-blue-600/80">
                {workCerts.length} disponibles
              </span>
            </div>

            {!worksInCompany ? (
              <div className="py-8 text-center text-sm text-blue-800/60">
                No registra vinculación laboral activa en este filtro. Active "Trabaja en la empresa" para visualizarlos.
              </div>
            ) : workCerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-blue-800/60">
                No se encontraron certificados laborales para el criterio actual.
              </div>
            ) : (
              <div className="divide-y divide-blue-100">
                <AnimatePresence initial={false}>
                  {workCerts.map((cert) => {
                    const isDownloaded = recentDownloadedId === cert.id;
                    return (
                      <motion.div
                        key={cert.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0F294A] truncate">
                            {cert.title}
                          </p>
                          <p className="text-xs font-mono tabular-nums text-blue-600/75 mt-0.5">
                            {cert.encryptedCode} · {cert.issueDate}
                          </p>
                        </div>

                        {/* Solo link directo de descarga */}
                        <a
                          href={`#download-${cert.encryptedCode}`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleDownloadCertificate(cert);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isDownloaded ? (
                            <>
                              <span className="material-symbols-outlined !text-base text-emerald-600">check_circle</span>
                              <span className="text-emerald-600">Descargado</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined !text-base">download</span>
                              <span>Link de descarga</span>
                            </>
                          )}
                        </a>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Columna 2: Certificados de Estudio */}
        {(categoryFilter === 'todos' || categoryFilter === 'estudio') && (
          <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#2563EB]">school</span>
                <h3 className="text-base font-semibold text-[#1E3A8A]">
                  Certificados de Estudio
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-blue-600/80">
                {studyCerts.length} disponibles
              </span>
            </div>

            {!studiedInCompany ? (
              <div className="py-8 text-center text-sm text-blue-800/60">
                No registra historial de formación en este filtro. Active "Estudió en la empresa" para visualizarlos.
              </div>
            ) : studyCerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-blue-800/60">
                No se encontraron certificados de estudio para el criterio actual.
              </div>
            ) : (
              <div className="divide-y divide-blue-100">
                <AnimatePresence initial={false}>
                  {studyCerts.map((cert) => {
                    const isDownloaded = recentDownloadedId === cert.id;
                    return (
                      <motion.div
                        key={cert.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0F294A] truncate">
                            {cert.title}
                          </p>
                          <p className="text-xs font-mono tabular-nums text-blue-600/75 mt-0.5">
                            {cert.encryptedCode} · {cert.issueDate}
                          </p>
                        </div>

                        {/* Solo link directo de descarga */}
                        <a
                          href={`#download-${cert.encryptedCode}`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleDownloadCertificate(cert);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isDownloaded ? (
                            <>
                              <span className="material-symbols-outlined !text-base text-emerald-600">check_circle</span>
                              <span className="text-emerald-600">Descargado</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined !text-base">download</span>
                              <span>Link de descarga</span>
                            </>
                          )}
                        </a>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
