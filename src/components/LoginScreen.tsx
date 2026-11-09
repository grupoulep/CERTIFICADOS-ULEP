import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedRibbons } from './AnimatedRibbons';
import { verifyAdminCedula, verifyAdminPassword } from '../utils/securityGuard';

interface LoginScreenProps {
  onSuccessLogin: (cedula: string, isAdmin: boolean) => void;
  onFailedAttempt: (cedula: string, reason: string) => void;
}

const ULEP_LOGO_URL = `${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`;

function generateCaptchaCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSuccessLogin,
  onFailedAttempt,
}) => {
  const [cedula, setCedula] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [captchaTarget, setCaptchaTarget] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdminCedula = verifyAdminCedula(cedula);

  const refreshCaptcha = useCallback(() => {
    setCaptchaTarget(generateCaptchaCode());
    setCaptchaInput('');
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    if (!isAdminCedula) {
      setAdminPassword('');
    }
  }, [isAdminCedula]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCedula = cedula.trim();
    if (!cleanCedula) {
      setErrorMsg('Ingrese su número de cédula.');
      return;
    }

    if (captchaInput.trim().toUpperCase() !== captchaTarget.toUpperCase()) {
      setErrorMsg('Código captcha incorrecto.');
      onFailedAttempt(cleanCedula || 'SIN_CEDULA', 'Verificación de Captcha fallida');
      setCaptchaTarget(generateCaptchaCode());
      setCaptchaInput('');
      return;
    }

    const isVerifiedAdmin = verifyAdminCedula(cleanCedula);

    if (isVerifiedAdmin) {
      if (!adminPassword.trim()) {
        setErrorMsg('Ingrese la contraseña administrativa.');
        return;
      }
      if (!verifyAdminPassword(adminPassword)) {
        setErrorMsg('Contraseña administrativa inválida.');
        onFailedAttempt(cleanCedula, 'Contraseña extra de administrador incorrecta');
        return;
      }
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onSuccessLogin(cleanCedula, isVerifiedAdmin);
    }, 280);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#FFFFFF] via-[#F2F8FF] to-[#E1EFFE] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Filtro SVG para que las partes blancas del logo se vean en azul institucional sobre fondo blanco, conservando ULEP en azul celeste */}
      <svg className="sr-only" aria-hidden="true">
        <defs>
          <filter id="ulep-white-to-blue" colorInterpolationFilters="sRGB">
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

      {/* Listones azules con animación de fondo */}
      <AnimatedRibbons />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white border border-blue-200 rounded-2xl p-8 relative z-10 shadow-xl shadow-blue-900/5"
      >
        {/* Logo Oficial ULEP + Título */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4 }}
          className="flex flex-col items-center mb-7"
        >
          <div className="w-48 h-24 overflow-hidden flex items-center justify-center">
            <img
              src={ULEP_LOGO_URL}
              alt="Logo ULEP"
              referrerPolicy="no-referrer"
              style={{ filter: 'url(#ulep-white-to-blue)' }}
              className="w-full h-full object-contain scale-[2.2] select-none pointer-events-none"
            />
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Campo Cédula */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.4 }}
          >
            <label
              htmlFor="cedula-input"
              className="block text-xs font-semibold text-[#1E40AF] mb-2"
            >
              Cédula
            </label>
            <input
              id="cedula-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cedula}
              onChange={(e) => {
                setCedula(e.target.value.replace(/[^0-9]/g, ''));
                setErrorMsg(null);
              }}
              placeholder="Número de cédula"
              className="w-full px-4 py-3 rounded-xl bg-[#F8FBFF] border border-blue-200 text-[#0F294A] font-mono tabular-nums text-sm placeholder:text-blue-400/70 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-colors"
            />
          </motion.div>

          {/* Contraseña extra exclusiva cuando la cédula es 902050377 */}
          <AnimatePresence initial={false}>
            {isAdminCedula && (
              <motion.div
                key="admin-password-field"
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-1">
                  <label
                    htmlFor="admin-password-input"
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] mb-2"
                  >
                    <span className="material-symbols-outlined !text-base">lock</span>
                    <span>Contraseña</span>
                  </label>
                  <input
                    id="admin-password-input"
                    type="password"
                    autoComplete="off"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="Contraseña de seguridad"
                    className="w-full px-4 py-3 rounded-xl bg-[#F0F7FF] border border-blue-400 text-[#0F294A] font-mono tabular-nums text-sm placeholder:text-blue-400/70 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Captcha */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4 }}
            className="space-y-3"
          >
            <label
              htmlFor="captcha-input"
              className="block text-xs font-semibold text-[#1E40AF]"
            >
              Captcha
            </label>

            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-12 rounded-xl bg-[#EAF4FF] border border-blue-200 flex items-center justify-center relative overflow-hidden select-none"
              >
                {/* Líneas geométricas en tonos azules */}
                <svg
                  className="absolute inset-0 w-full h-full opacity-45 pointer-events-none"
                  viewBox="0 0 200 48"
                  fill="none"
                >
                  <path
                    d="M0 14 Q 50 38, 100 12 T 200 32"
                    stroke="#3B82F6"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M0 36 Q 60 8, 120 34 T 200 14"
                    stroke="#93C5FD"
                    strokeWidth="1.5"
                  />
                </svg>

                <div className="relative z-10 flex items-center gap-2.5 font-mono text-lg font-bold tracking-[0.25em] text-[#1D4ED8]">
                  {captchaTarget.split('').map((char, index) => (
                    <motion.span
                      key={`${char}-${index}-${captchaTarget}`}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        rotate: index % 2 === 0 ? -5 : 6,
                      }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className="inline-block"
                    >
                      {char}
                    </motion.span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={refreshCaptcha}
                aria-label="Actualizar captcha"
                className="h-12 w-12 rounded-xl bg-[#F8FBFF] border border-blue-200 hover:border-[#2563EB] hover:bg-[#EAF4FF] text-[#2563EB] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined !text-lg">refresh</span>
              </button>
            </div>

            <input
              id="captcha-input"
              type="text"
              autoComplete="off"
              value={captchaInput}
              onChange={(e) => {
                setCaptchaInput(e.target.value.toUpperCase());
                setErrorMsg(null);
              }}
              placeholder="Escriba el código captcha"
              className="w-full px-4 py-3 rounded-xl bg-[#F8FBFF] border border-blue-200 text-[#0F294A] font-mono text-sm uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:text-blue-400/70 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-colors"
            />
          </motion.div>

          {/* Mensaje de error si ocurre */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
              >
                <span className="material-symbols-outlined !text-lg text-red-600 shrink-0">warning</span>
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Botón de ingreso en azul institucional con texto blanco */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shadow-md shadow-blue-600/20"
          >
            <span>{isSubmitting ? 'Verificando...' : 'Ingresar'}</span>
            <span className="material-symbols-outlined !text-lg">arrow_forward</span>
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};
