import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const translations = {
  English: {
    dashboard: 'Dashboard',
    students: 'Students',
    attendance: 'Attendance',
    permissions: 'Permissions',
    discipline: 'Discipline',
    transport: 'Transport',
    gate: 'Gate Return',
    smart_bell: 'Smart Bell',
    settings: 'Settings',
    sign_out: 'Sign Out',
    welcome: 'Welcome',
    system_time: 'LOCAL SYSTEM TIME',
    admin_portal: 'ADMINISTRATOR PORTAL',
    secure_access: 'SECURE ACCESS TERMINAL',
    identity_node: 'IDENTITY NODE READY',
    leadership_access: 'LEADERSHIP ACCESS POINT',
    command_access: 'Command access.',
    auth_identity: 'AUTHENTICATE IDENTITY',
    username: 'USERNAME',
    password: 'PASSWORD',
    verify_creds: 'VERIFYING CREDENTIALS...',
    secure_login: 'SECURE ADMINISTRATOR LOG IN',
    encrypted_session: 'ENCRYPTED SESSION',
    authorized_only: 'AUTHORIZED PERSONNEL ONLY',
    save_changes: 'Save changes',
    nothing_to_change: 'Nothing to change yet.',
    unsaved_changes: 'You have unsaved changes.',
    all_saved: 'All changes saved.',
  },
  Français: {
    dashboard: 'Tableau de bord',
    students: 'Étudiants',
    attendance: 'Présence',
    permissions: 'Permissions',
    discipline: 'Discipline',
    transport: 'Transport',
    gate: 'Retour Porte',
    smart_bell: 'Cloche Intelligente',
    settings: 'Paramètres',
    sign_out: 'Déconnexion',
    welcome: 'Bienvenue',
    system_time: 'HEURE DU SYSTÈME LOCAL',
    admin_portal: 'PORTAIL ADMINISTRATEUR',
    secure_access: 'TERMINAL D\'ACCÈS SÉCURISÉ',
    identity_node: 'NŒUD D\'IDENTITÉ PRÊT',
    leadership_access: 'POINT D\'ACCÈS AU LEADERSHIP',
    command_access: 'Accès commande.',
    auth_identity: 'AUTHENTIFIER L\'IDENTITÉ',
    username: 'NOM D\'UTILISATEUR',
    password: 'MOT DE PASSE',
    verify_creds: 'VÉRIFICATION DES IDENTIFIANTS...',
    secure_login: 'CONNEXION SÉCURISÉE DE L\'ADMINISTRATEUR',
    encrypted_session: 'SESSION CHIFFRÉE',
    authorized_only: 'PERSONNEL AUTORISÉ UNIQUEMENT',
    save_changes: 'Sauvegarder',
    nothing_to_change: 'Rien à changer pour le moment.',
    unsaved_changes: 'Vous avez des modifications non enregistrées.',
    all_saved: 'Toutes les modifications sont enregistrées.',
  },
  Kiswahili: {
    dashboard: 'Dashibodi',
    students: 'Wanafunzi',
    attendance: 'Mahudhurio',
    permissions: 'Ruhusa',
    discipline: 'Nidhamu',
    transport: 'Usafiri',
    gate: 'Kurudi Lango',
    smart_bell: 'Kengele Mahiri',
    settings: 'Mipangilio',
    sign_out: 'Ondoka',
    welcome: 'Karibu',
    system_time: 'MUDA WA MFUMO WA NDANI',
    admin_portal: 'TOVUTI YA UTAWALA',
    secure_access: 'TERMINALI YA UPATIKANAJI SALAMA',
    identity_node: 'NODE YA UTAMBULISHO TAYARI',
    leadership_access: 'HATUA YA UPATIKANAJI WA UONGOZI',
    command_access: 'Amri ya kufikia.',
    auth_identity: 'THIBITISHA UTAMBULISHO',
    username: 'JINA LA MTUMIAJI',
    password: 'NYWILA',
    verify_creds: 'KUHAKIKISHA VITAMBULISHO...',
    secure_login: 'INGIA SALAMA KWA UTAWALA',
    encrypted_session: 'KIPINDI KILICHOSIMBWA',
    authorized_only: 'WATUMISHI WALIOIDHINISHWA PEKEE',
    save_changes: 'Hifadhi mabadiliko',
    nothing_to_change: 'Hakuna cha kubadilisha bado.',
    unsaved_changes: 'Una mabadiliko ambayo hayajahifadhiwa.',
    all_saved: 'Mabadiliko yote yamehifadhiwa.',
  },
  Ikinyarwanda: {
    dashboard: 'Imbonerahamwe',
    students: 'Abanyeshuri',
    attendance: 'Imyitwarire',
    permissions: 'Uruhushya',
    discipline: 'Ibihano',
    transport: 'Gutwara',
    gate: 'Irembo',
    smart_bell: 'Inzogera',
    settings: 'Igenamiterere',
    sign_out: 'Sohoka',
    welcome: 'Murakaza neza',
    system_time: 'IGIHE CYA SISITEMU',
    admin_portal: 'UBURYO BW\'UBUYOBOZI',
    secure_access: 'INJIRA MU BURYO BWIZEYE',
    identity_node: 'UMURONGO W\'UMWIRONDORO WITEGUYE',
    leadership_access: 'AHANTU HO KWINJIRA KWA KINYAMERERE',
    command_access: 'Tanga amabwiriza yo kwinjira.',
    auth_identity: 'YEMEZA UMWIRONDORO',
    username: 'IZINA RY\'UKORESHA',
    password: 'IJAMBO RY\'IBANGA',
    verify_creds: 'KUGENZURA IBYANGOMBWA...',
    secure_login: 'INJIRA MU BURYO BWIZEYE NK\'UBUYOBOZI',
    encrypted_session: 'IGIHE GIFITE UMUTEKANO',
    authorized_only: 'ABASHINZWE AKA KAZI GUSA',
    save_changes: 'Bika impinduka',
    nothing_to_change: 'Nta cyahindutse.',
    unsaved_changes: 'Hari impinduka utarabika.',
    all_saved: 'Impinduka zose zabitswe.',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('mipc:language') || 'English';
  });

  useEffect(() => {
    localStorage.setItem('mipc:language', language);
  }, [language]);

  const t = useMemo(() => translations[language] || translations.English, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languages: Object.keys(translations),
  }), [language, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider.');
  return context;
}
