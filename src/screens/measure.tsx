import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Dropdown } from '@/components/dropdown';
import { ThemedText } from '@/components/themed-text';
import { LOCATIONS, OPERATORS, TEST } from '@/constants/app';
import { insertMeasurement, lastFieldMeasurement } from '@/db';
import { periodOf } from '@/measure/calc';
import { runTest, type RunResult, type Stage } from '@/measure/network-test';
import { getRadioInfo } from '@/measure/radio';
import { simulateTest } from '@/measure/simulate';
import { useTheme } from '@/hooks/use-theme';
import type { RadioInfo, Technology } from '@/types';
import { num } from '@/utils/format';
import { matchOperator } from '@/utils/operator';
import { technologyMismatch } from '@/utils/radio-check';
import { summarize } from '@/utils/stats';

const STAGE_LABEL: Record<Stage, string> = {
  latency: 'measuring latency',
  download: 'testing download',
  upload: 'testing upload',
};

/** Empty -> null (not recorded); a plausible negative dBm -> number; anything else -> 'invalid'. */
function parseSignal(text: string): number | null | 'invalid' {
  if (text.trim() === '') return null;
  const v = Number(text.replace(',', '.'));
  return Number.isFinite(v) && v <= -20 && v >= -150 ? v : 'invalid';
}

async function currentPosition() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const fix = await Promise.race([
      Location.getLastKnownPositionAsync().then(
        (p) => p ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      ),
      timeout,
    ]);
    return fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** One line telling the researcher what the phone reports. */
function describeRadio(radio: RadioInfo | null): string {
  if (!radio) return 'Checking the phone…';
  if (radio.source === 'native') {
    const signal = radio.signalDbm !== null ? `, signal ${radio.signalDbm} dBm` : '';
    const note = radio.reliable ? '' : ' Android cannot tell 4G from 5G NSA on this phone, so pick it yourself.';
    return `Phone reports ${radio.networkType ?? 'an unknown network'}${signal}.${note}`;
  }
  return radio.technology
    ? `Phone reports ${radio.technology}. Change it if that is wrong.`
    : 'Phone did not report 4G/5G. Pick it yourself.';
}

export function Measure() {
  const theme = useTheme();
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [technology, setTechnology] = useState<Technology>('4G');
  const [radio, setRadio] = useState<RadioInfo | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [signal, setSignal] = useState('');
  const [runs, setRuns] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const last = lastFieldMeasurement();
    if (last) {
      setLocation(last.location);
      setTechnology(last.technology);
      setOperator(matchOperator(last.operator));
    }
    checkPhone(true);
  }, []);

  /** Reads the phone's connection; on first load it also fills in technology and operator. */
  function checkPhone(prefill = false) {
    getRadioInfo().then((info) => {
      setRadio(info);
      if (!prefill) return;
      if (info.technology) setTechnology(info.technology);
      const detectedOperator = matchOperator(info.operator);
      if (detectedOperator) setOperator((o) => o ?? detectedOperator);
    });
  }

  async function start() {
    setError(null);
    const dbm = parseSignal(signal);
    if (dbm === 'invalid') {
      setError('Signal must be a negative number in dBm, for example -95, or left empty.');
      return;
    }
    if (!operator) {
      setError('Select the operator (network provider) you are testing.');
      return;
    }
    if (!simulate) {
      const net = await Network.getNetworkStateAsync();
      if (net.type !== Network.NetworkStateType.CELLULAR) {
        setError('Not on mobile data. Turn Wi-Fi off first, otherwise this is not a 4G/5G measurement.');
        return;
      }
    }

    const controller = new AbortController();
    abort.current = controller;
    setResults([]);
    setRunning(true);
    setProgress(simulate ? 'Starting simulation…' : 'Getting location…');
    const position = simulate ? null : await currentPosition();
    const sessionId = String(Date.now());

    try {
      for (let i = 1; i <= runs; i++) {
        const onStage = (stage: Stage) => setProgress(`Run ${i} of ${runs}: ${STAGE_LABEL[stage]}…`);
        const when = new Date();
        const period = periodOf(when);
        let live: RadioInfo | null = null;
        if (!simulate) {
          live = await getRadioInfo();
          setRadio(live);
          const mismatch = technologyMismatch(live, technology);
          if (mismatch) throw new Error(mismatch);
        }
        const r = simulate
          ? await simulateTest(controller.signal, onStage, technology, period, dbm)
          : await runTest(controller.signal, onStage);
        insertMeasurement({
          session_id: sessionId,
          created_at: when.toISOString(),
          location,
          period,
          technology,
          detected_technology: live?.technology ?? null,
          operator,
          signal_dbm: live?.signalDbm ?? dbm,
          download_mbps: r.downloadMbps,
          upload_mbps: r.uploadMbps,
          latency_ms: r.latencyMs,
          jitter_ms: r.jitterMs,
          packet_loss_pct: r.lossPct,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          source: simulate ? 'demo' : 'field',
        });
        setResults((prev) => [...prev, r]);
      }
      setProgress(simulate ? 'Simulation done. Saved as demo data on the Data tab.' : 'Done. Every run is saved on the Data tab.');
    } catch (e) {
      if (controller.signal.aborted) setProgress('Stopped. Completed runs are saved.');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      abort.current = null;
    }
  }

  const usedMb = results.reduce((a, r) => a + r.bytes, 0) / 1e6;
  const mean = (pick: (r: RunResult) => number) => summarize(results.map(pick))?.mean;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card title="Where">
        <View style={styles.chips}>
          {LOCATIONS.map((l) => (
            <Chip key={l} label={l} selected={l === location} disabled={running} onPress={() => setLocation(l)} />
          ))}
        </View>
      </Card>

      <Card title="Network">
        <View style={styles.chips}>
          {(['4G', '5G'] as const).map((t) => (
            <Chip key={t} label={t} selected={t === technology} disabled={running} onPress={() => setTechnology(t)} />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {describeRadio(radio)}
        </ThemedText>
        {radio?.details ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.details}>
            {radio.details}
          </ThemedText>
        ) : null}
        <View style={styles.recheck}>
          <Button title="Check phone again" variant="secondary" compact disabled={running} onPress={() => checkPhone()} />
        </View>
        <Dropdown
          value={operator}
          options={OPERATORS}
          placeholder="Select operator"
          onChange={setOperator}
          disabled={running}
        />
        {radio?.source === 'native' ? (
          <ThemedText type="small" themeColor="textSecondary">
            Signal strength is read from the phone at the start of every run.
          </ThemedText>
        ) : (
          <TextInput
            value={signal}
            onChangeText={setSignal}
            editable={!running}
            keyboardType="numbers-and-punctuation"
            placeholder="Signal in dBm from Network Cell Info (optional)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          />
        )}
      </Card>

      <Card title="Runs">
        <View style={styles.chips}>
          {Array.from({ length: TEST.maxRuns }, (_, i) => i + 1).map((n) => (
            <Chip key={n} label={String(n)} selected={n === runs} disabled={running} onPress={() => setRuns(n)} />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Each run can use 10 to 90 MB of mobile data, depending on your speed.
        </ThemedText>
      </Card>

      <Card title="Simulation mode">
        <View style={styles.switchRow}>
          <ThemedText type="smallBold">Simulate runs</ThemedText>
          <Switch
            value={simulate}
            onValueChange={setSimulate}
            disabled={running}
            trackColor={{ true: theme.accent }}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Runs without the network and saves made-up results marked "demo". Use it to try the whole app on Wi-Fi.
        </ThemedText>
      </Card>

      {running ? (
        <Button title="Stop" variant="danger" onPress={() => abort.current?.abort()} />
      ) : (
        <Button title={`${simulate ? 'Simulate' : 'Start'} ${runs} run${runs > 1 ? 's' : ''}`} onPress={start} />
      )}

      {progress ? <ThemedText type="small">{progress}</ThemedText> : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      {results.length > 0 && (
        <Card title="Results">
          <Row cells={['Run', 'Down', 'Up', 'Ping', 'Jitter', 'Loss']} bold />
          {results.map((r, i) => (
            <Row
              key={i}
              cells={[
                String(i + 1),
                num(r.downloadMbps),
                num(r.uploadMbps),
                num(r.latencyMs, 0),
                num(r.jitterMs, 1),
                `${num(r.lossPct, 0)}%`,
              ]}
            />
          ))}
          {results.length > 1 && (
            <Row
              bold
              cells={[
                'Mean',
                num(mean((r) => r.downloadMbps)),
                num(mean((r) => r.uploadMbps)),
                num(mean((r) => r.latencyMs), 0),
                num(mean((r) => r.jitterMs), 1),
                `${num(mean((r) => r.lossPct), 0)}%`,
              ]}
            />
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Down / Up in Mbps, Ping / Jitter in ms. {usedMb > 0 ? `Data used: ${num(usedMb, 0)} MB.` : 'Simulated: no data used.'}
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

function Row({ cells, bold }: { cells: string[]; bold?: boolean }) {
  return (
    <View style={styles.row}>
      {cells.map((c, i) => (
        <ThemedText key={i} type={bold ? 'smallBold' : 'small'} style={styles.cell}>
          {c}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recheck: { alignItems: 'flex-start' },
  details: { fontSize: 12, lineHeight: 17 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
