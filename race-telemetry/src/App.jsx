import { useState } from 'react';
import { COLORS } from '@/constants/colors';
import { useTelemetryData } from '@/hooks/useTelemetryData';
import { Header, TabBar } from '@/components/layout';
import UploadView from '@/components/UploadView';
import {
  OverviewTab,
  LapCompareTab,
  WOTAnalysisTab,
  VitalsTab,
  ReportTab,
  TrackMapTab,
  TemperatureTab,
  SetupSheetTab,
  FeedbackTab,
} from '@/components/tabs';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

  const {
    data,
    channels,
    lapsAnalysis,
    bestLapNum,
    feedback,
    loadFile,
    clearData,
    isLoaded,
  } = useTelemetryData();

  // Upload screen
  if (!isLoaded) {
    return (
      <div style={{ background: COLORS.bg, minHeight: '100vh' }}>
        <UploadView onLoad={loadFile} />
      </div>
    );
  }

  // Main dashboard
  return (
    <div style={{ background: COLORS.bg, minHeight: '100vh', color: COLORS.textPrimary }}>
      <Header fileName={data.fileName} onNewSession={clearData} />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            data={data}
            channels={channels}
            lapsAnalysis={lapsAnalysis}
            bestLapNum={bestLapNum}
          />
        )}
        {activeTab === 'laps' && (
          <LapCompareTab
            data={data}
            channels={channels}
            lapsAnalysis={lapsAnalysis}
          />
        )}
        {activeTab === 'wot' && (
          <WOTAnalysisTab
            data={data}
            channels={channels}
          />
        )}
        {activeTab === 'vitals' && (
          <VitalsTab data={data} channels={channels} />
        )}
        {activeTab === 'report' && (
          <ReportTab
            data={data}
            channels={channels}
            lapsAnalysis={lapsAnalysis}
            bestLapNum={bestLapNum}
          />
        )}
        {activeTab === 'track' && (
          <TrackMapTab
            data={data}
            channels={channels}
            lapsAnalysis={lapsAnalysis}
          />
        )}
        {activeTab === 'temperature' && (
          <TemperatureTab
            data={data}
            channels={channels}
          />
        )}
        {activeTab === 'setup' && (
          <SetupSheetTab />
        )}
        {activeTab === 'feedback' && (
          <FeedbackTab
            feedback={feedback}
            bestLapNum={bestLapNum}
            lapsAnalysis={lapsAnalysis}
          />
        )}
      </main>
    </div>
  );
}
