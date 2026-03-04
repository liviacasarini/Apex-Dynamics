import { COLORS } from '@/constants/colors';
import { TABS } from '@/constants/tabs';

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 2,
        padding: '0 24px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        overflowX: 'auto',
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '12px 20px',
              cursor: 'pointer',
              fontSize: 13,
              color: active ? COLORS.accent : COLORS.textSecondary,
              borderBottom: active
                ? `2px solid ${COLORS.accent}`
                : '2px solid transparent',
              transition: 'all 0.2s',
              fontWeight: active ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </div>
        );
      })}
    </nav>
  );
}
