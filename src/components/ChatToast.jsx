import { useEffect } from 'react';
import { useTeam } from '@/context/TeamContext';

const DISMISS_DELAY = 5000;

export default function ChatToast() {
  const { chatToast, dismissChatToast } = useTeam();

  useEffect(() => {
    if (!chatToast) return;
    const id = setTimeout(dismissChatToast, DISMISS_DELAY);
    return () => clearTimeout(id);
  }, [chatToast, dismissChatToast]);

  if (!chatToast) return null;

  const text = chatToast.preview;
  const truncated = text.length >= 60 ? text + '…' : text;

  return (
    <div style={styles.container}>
      <div style={styles.accent} />
      <div style={styles.body}>
        <span style={styles.name}>{chatToast.senderName}</span>
        <span style={styles.message}>{truncated}</span>
      </div>
      <button style={styles.close} onClick={dismissChatToast} aria-label="Fechar">×</button>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'stretch',
    maxWidth: 320,
    minWidth: 220,
    background: '#131720',
    border: '1px solid #252e42',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    animation: 'chatToastIn 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    flexShrink: 0,
    background: '#e63946',
    borderRadius: '10px 0 0 10px',
  },
  body: {
    flex: 1,
    padding: '11px 12px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  name: {
    fontSize: 11,
    fontWeight: 700,
    color: '#e63946',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 13,
    color: '#c0c8dc',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  close: {
    background: 'none',
    border: 'none',
    color: '#4a556e',
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 12px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'color 0.15s',
  },
};
