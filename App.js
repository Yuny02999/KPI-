import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "counter-mobile-app:v3";
const LEGACY_STORAGE_KEY = "counter-mobile-app:v2";
const blurProps = {
  intensity: 72,
  tint: "light",
  experimentalBlurMethod: "dimezisBlurView"
};
const CHECKPOINT_LOCATION_TIMEOUT_MS = 12000;
const CHECKPOINT_HIGH_ACCURACY_TIMEOUT_MS = 18000;
const CHECKPOINT_LAST_LOCATION_MAX_AGE_MS = 15000;
const CHECKPOINT_STALE_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const CHECKPOINT_GOOD_ACCURACY_METERS = 20;
const CHECKPOINT_WEAK_ACCURACY_METERS = 50;
const CHECKPOINT_TARGET_ACCURACY_METERS = 30;
const TASK_FLOAT_WIDTH = 96;
const TASK_FLOAT_HEIGHT = 50;
const TASK_FLOAT_COLLAPSED_WIDTH = 32;
const TASK_FLOAT_MARGIN = 18;
const TASK_FLOAT_BOTTOM_OFFSET = 86;
const TASK_MENU_WIDTH = 250;
const TASK_MENU_ESTIMATED_HEIGHT = 116;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

const metricGroups = [
  { id: "scenario", title: "场景性能指标", color: "#f76b0b", metrics: ["施工场景"] },
  {
    id: "intersection",
    title: "路口性能指标",
    color: "#31a64a",
    metrics: ["路口通行动态交互", "左转待转区"]
  },
  { id: "lane", title: "变道性能指标", color: "#9563e8", metrics: ["汇入", "汇出"] },
  {
    id: "comfort",
    title: "体感性能指标",
    color: "#4f7ff0",
    metrics: ["车辆Cutin", "非预期制动", "非预期横向"]
  },
  {
    id: "detour",
    title: "绕行性能指标",
    color: "#18aa98",
    metrics: ["绕行", "小路/窄路动态交互通行"]
  }
];

const severityLevels = [
  { id: "minor", label: "轻微", color: "#22c55e" },
  { id: "normal", label: "一般", color: "#f59e0b" },
  { id: "critical", label: "严重", color: "#ef4444" }
];

const checkpointPerformanceOptions = [
  { id: "good", label: "正常通过", color: "#16a34a" },
  { id: "normal", label: "基本正常", color: "#1d4ed8" },
  { id: "bad", label: "表现异常", color: "#f59e0b" },
  { id: "takeover", label: "接管/失败", color: "#dc2626" }
];

const problemKeywordMap = {
  施工场景: ["施工", "锥桶", "围挡", "占道", "临时车道"],
  路口通行动态交互: ["路口", "红绿灯", "信号灯", "行人", "非机动车", "抢行", "交互"],
  左转待转区: ["左转", "待转", "待转区"],
  汇入: ["汇入", "并入", "匝道", "合流"],
  汇出: ["汇出", "驶出", "出口", "分流"],
  车辆Cutin: ["cutin", "cut-in", "插入", "加塞", "切入", "近距离"],
  非预期制动: ["刹车", "制动", "急刹", "减速", "顿挫"],
  非预期横向: ["横向", "偏移", "压线", "摆动", "蛇形"],
  绕行: ["绕行", "避让", "障碍", "借道"],
  "小路/窄路动态交互通行": ["小路", "窄路", "会车", "窄桥", "单车道"]
};

const calculatedMetricItems = [
  { id: "emergency-mpci", label: "紧急接管MPCI", type: "distance", unit: "km/次", countLabel: "紧急接管次数" },
  { id: "all-mpi", label: "所有接管MPI", type: "distance", unit: "km/次", countLabel: "所有接管次数" },
  { id: "unexpected-longitudinal", label: "非预期纵向", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "unexpected-steering", label: "非预期转向", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "missed-braking", label: "漏制动", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "cutin-success", label: "Cutin成功成功率", type: "rate", unit: "%" },
  { id: "vru-failure", label: "VRU交互失败次数", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "bad-lane-change", label: "不合理变道", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "late-lane-change", label: "未及时发起变道", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "dangerous-lane-change", label: "危险变道", type: "distance", unit: "km/次", countLabel: "失败次数" },
  { id: "construction-success", label: "施工场景成功率", type: "rate", unit: "%" },
  { id: "detour-success", label: "绕行成功率", type: "rate", unit: "%" },
  { id: "intersection-success", label: "路口通行动态交互成功率", type: "rate", unit: "%" },
  { id: "roundabout-success", label: "环岛通过成功率", type: "rate", unit: "%" },
  { id: "uturn-success", label: "掉头通过成功率", type: "rate", unit: "%" },
  { id: "waiting-zone-success", label: "待转区通过成功率", type: "rate", unit: "%" },
  { id: "traffic-light-success", label: "红绿灯识别成功率", type: "rate", unit: "%" },
  { id: "lane-selection-success", label: "选道成功率", type: "rate", unit: "%" },
  { id: "merge-in-success", label: "汇入成功率（考虑体感）", type: "rate", unit: "%" },
  { id: "merge-out-success", label: "汇出成功率（考虑体感）", type: "rate", unit: "%" },
  { id: "system-degrade", label: "系统降级/退出次数", type: "distance", unit: "km/次", countLabel: "次数" }
];

const defaultSession = {
  name: "默认测试任务",
  taskType: "drive",
  route: "",
  vehicle: "",
  version: "",
  staff: "",
  startMileage: "",
  endMileage: "",
  testMileage: "",
  startedAt: new Date().toISOString()
};

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMetric(group, name, index) {
  const createdAt = now();
  return {
    id: `${group.id}-${index}-${name}`,
    categoryId: group.id,
    categoryName: group.title,
    color: group.color,
    name,
    count: 0,
    createdAt,
    updatedAt: createdAt
  };
}

const initialMetrics = metricGroups.flatMap((group) =>
  group.metrics.map((name, index) => createMetric(group, name, index))
);

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function parseMileage(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseNonNegativeNumber(value) {
  const number = parseMileage(value);
  return number !== null && number >= 0 ? number : null;
}

function formatMileage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "待补";
  }
  return `${number.toFixed(1)} km`;
}

function formatPerformanceValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "未发生";
  }
  return `${number.toFixed(2)} km/次`;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeMetricName(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function getMetricKeywords(metric) {
  const baseKeywords = [metric.name, metric.categoryName];
  return [...baseKeywords, ...(problemKeywordMap[metric.name] ?? [])]
    .map(normalizeText)
    .filter(Boolean);
}

function scoreProblemTag(metric, text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }
  return getMetricKeywords(metric).reduce(
    (score, keyword) => (normalized.includes(keyword) ? score + 1 : score),
    0
  );
}

function sortMetricsForDisplay(items) {
  const groupOrder = new Map(metricGroups.map((group, index) => [group.id, index]));
  const originalOrder = new Map((items ?? []).map((item, index) => [item.id, index]));
  return [...(items ?? [])].sort((first, second) => {
    const firstGroupIndex = groupOrder.get(first.categoryId) ?? 999;
    const secondGroupIndex = groupOrder.get(second.categoryId) ?? 999;
    if (firstGroupIndex !== secondGroupIndex) {
      return firstGroupIndex - secondGroupIndex;
    }

    return (originalOrder.get(first.id) ?? 0) - (originalOrder.get(second.id) ?? 0);
  });
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "待统计";
  }
  return `${number.toFixed(1)}%`;
}

function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return String(Number(number.toFixed(2)));
}

function calculateDistanceMeters(first, second) {
  if (!first || !second) {
    return null;
  }
  const firstLatitude = Number(first.latitude);
  const firstLongitude = Number(first.longitude);
  const secondLatitude = Number(second.latitude);
  const secondLongitude = Number(second.longitude);
  if (
    !Number.isFinite(firstLatitude) ||
    !Number.isFinite(firstLongitude) ||
    !Number.isFinite(secondLatitude) ||
    !Number.isFinite(secondLongitude)
  ) {
    return null;
  }

  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(secondLatitude - firstLatitude);
  const deltaLongitude = toRadians(secondLongitude - firstLongitude);
  const lat1 = toRadians(firstLatitude);
  const lat2 = toRadians(secondLatitude);
  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(6) : "-";
}

function formatLocationAccuracy(coords) {
  const accuracy = Number(coords?.accuracy);
  return Number.isFinite(accuracy) ? `±${Math.round(accuracy)}m` : "精度未知";
}

function getCheckpointLocationQuality(coords, updatedAt, status) {
  if (!coords || !updatedAt) {
    if (status === "等待定位信号" || status === "等待定位回调") {
      return {
        label: "等待定位",
        tone: "pending",
        description: "还没有拿到坐标，请确认手机定位和精确位置已开启"
      };
    }
    if (
      status === "正在检查定位权限" ||
      status === "正在启动定位监听" ||
      status === "正在启动定位刷新" ||
      status === "正在主动获取定位"
    ) {
      return {
        label: status === "正在主动获取定位" ? "主动定位中" : "定位启动中",
        tone: "pending",
        description:
          status === "正在主动获取定位"
            ? "正在主动读取当前位置"
            : "正在连接手机定位服务"
      };
    }
    if (status === "定位权限未开启" || status === "设备定位未开启") {
      return {
        label: "定位不可用",
        tone: "failed",
        description: "请开启定位权限和系统定位服务"
      };
    }
    return {
      label: "定位预热中",
      tone: "pending",
      description: "进入页面后会自动获取当前位置"
    };
  }

  const ageMs = Date.now() - updatedAt;
  if (ageMs > CHECKPOINT_LAST_LOCATION_MAX_AGE_MS) {
    if (
      status === "定位预热中" ||
      status === "正在刷新定位" ||
      status === "等待定位信号" ||
      status === "等待定位回调" ||
      status === "正在启动定位监听" ||
      status === "正在启动定位刷新" ||
      status === "正在主动获取定位"
    ) {
      return {
        label: "定位刷新中",
        tone: "pending",
        description: "正在更新当前位置"
      };
    }
    return {
      label: "定位已过期",
      tone: "failed",
      description: "正在重新获取当前位置"
    };
  }

  const accuracy = Number(coords.accuracy);
  if (!Number.isFinite(accuracy)) {
    return {
      label: "可打点",
      tone: "ready",
      description: "已获取当前位置，精度未知"
    };
  }

  if (accuracy <= CHECKPOINT_GOOD_ACCURACY_METERS) {
    return {
      label: "定位良好",
      tone: "ready",
      description: `${formatLocationAccuracy(coords)}，适合记录考点`
    };
  }

  if (accuracy <= CHECKPOINT_WEAK_ACCURACY_METERS) {
    return {
      label: "定位可用",
      tone: "warning",
      description: `${formatLocationAccuracy(coords)}，可记录但建议确认位置`
    };
  }

  return {
    label: "精度较弱",
    tone: "failed",
    description: `${formatLocationAccuracy(coords)}，保存前会二次确认`
  };
}

function getBestNavigationAccuracy() {
  return (
    Location.Accuracy.BestForNavigation ??
    Location.Accuracy.Highest ??
    Location.Accuracy.High
  );
}

function getCheckpointPerformanceOption(id) {
  return (
    checkpointPerformanceOptions.find((option) => option.id === id) ??
    checkpointPerformanceOptions[1]
  );
}

function sortCheckpointRecordsForDisplay(records) {
  return [...(records ?? [])].sort((first, second) => {
    const firstIndex = Number.isFinite(first.sequenceIndex) ? first.sequenceIndex : 9999;
    const secondIndex = Number.isFinite(second.sequenceIndex) ? second.sequenceIndex : 9999;
    if (firstIndex !== secondIndex) {
      return firstIndex - secondIndex;
    }
    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
  });
}

function formatCalculatedMetric(item, input, mileage) {
  if (item.type === "rate") {
    const success = parseNonNegativeNumber(input?.success);
    const total = parseNonNegativeNumber(input?.total);
    if (total === null || total <= 0) {
      if (success === 0 && total === 0) {
        return "-";
      }
      return "待填写";
    }
    const safeSuccess = success ?? 0;
    return formatPercent((safeSuccess / total) * 100);
  }

  const count = parseNonNegativeNumber(input?.count);
  if (count === null) {
    return "待填写";
  }
  if (count <= 0) {
    if (mileage === null || mileage <= 0) {
      return "待里程";
    }
    const mileageText = Number.isInteger(mileage)
      ? String(mileage)
      : String(Number(mileage.toFixed(2)));
    return `${mileageText}+(${mileageText}/0)`;
  }
  if (mileage === null || mileage <= 0) {
    return "待里程";
  }
  return `${(mileage / count).toFixed(2)} ${item.unit}`;
}

function formatCalculatedMetricForExport(item, input, mileage) {
  const result = formatCalculatedMetric(item, input, mileage);
  if (item.type !== "rate" || result === "待填写" || result === "-") {
    if (item.type === "distance" && result.endsWith(` ${item.unit}`)) {
      const count = parseNonNegativeNumber(input?.count) ?? 0;
      const mileageText =
        mileage === null
          ? "-"
          : formatCompactNumber(mileage);
      const resultText = result.replace(` ${item.unit}`, "");
      return `${formatCompactNumber(resultText)}（${mileageText}/${formatCompactNumber(count)}）`;
    }
    return result;
  }

  const success = parseNonNegativeNumber(input?.success) ?? 0;
  const total = parseNonNegativeNumber(input?.total) ?? 0;
  const percentText = result.endsWith("%")
    ? `${formatCompactNumber(result.replace("%", ""))}%`
    : result;
  return `${percentText}（${formatCompactNumber(success)}/${formatCompactNumber(total)}）`;
}

function isCalculatedMetricInvalid(item, input) {
  if (item.type !== "rate") {
    return false;
  }

  const success = parseNonNegativeNumber(input?.success);
  const total = parseNonNegativeNumber(input?.total);
  return success !== null && total !== null && total > 0 && success > total;
}

function getCalculatedMetricStatus(item, input, mileage) {
  if (isCalculatedMetricInvalid(item, input)) {
    return "invalid";
  }

  const result = formatCalculatedMetric(item, input, mileage);
  if (result === "待填写" || result === "待里程") {
    return "pending";
  }
  return "complete";
}

function calculateProblemTagSummary(records, mileage = null) {
  const groups = new Map();
  const distance = Number(mileage);

  records.forEach((record) => {
    (record.tags ?? []).forEach((tag) => {
      const id = tag.id ?? tag.name;
      const current =
        groups.get(id) ?? {
          id,
          name: tag.name,
          categoryName: tag.categoryName ?? "自定义标签",
          color: tag.color ?? "#1f2937",
          total: 0,
          success: 0,
          failure: 0,
          successRate: null,
          failureRate: null,
          mileagePerFailure: null
        };

      current.total += 1;
      if (record.result === "success") {
        current.success += 1;
      } else {
        current.failure += 1;
      }
      groups.set(id, current);
    });
  });

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      successRate: item.total > 0 ? (item.success / item.total) * 100 : null,
      failureRate: item.total > 0 ? (item.failure / item.total) * 100 : null,
      mileagePerFailure:
        Number.isFinite(distance) && distance > 0 && item.failure > 0
          ? distance / item.failure
          : null
    }))
    .sort((first, second) => second.total - first.total);
}

function calculatePerformanceSummary(sessionSnapshot, eventList) {
  const startMileage = parseMileage(sessionSnapshot.startMileage);
  const endMileage = parseMileage(sessionSnapshot.endMileage);
  const directMileage = parseMileage(
    sessionSnapshot.testMileage ?? sessionSnapshot.mileage
  );
  const mileage =
    directMileage !== null
      ? directMileage
      : startMileage !== null && endMileage !== null
      ? Math.max(0, endMileage - startMileage)
      : null;
  const interventionCount = eventList.length;
  const criticalInterventionCount = eventList.filter(
    (event) => event.severity === "critical"
  ).length;

  return {
    startMileage,
    endMileage,
    testMileage: directMileage,
    mileage,
    interventionCount,
    criticalInterventionCount,
    mpi: interventionCount > 0 && mileage > 0 ? mileage / interventionCount : null,
    mpci:
      criticalInterventionCount > 0 && mileage > 0
        ? mileage / criticalInterventionCount
        : null
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFileNamePart(value, fallback) {
  const safeValue = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "");
  return safeValue || fallback;
}

function GlassView({ children, style }) {
  return (
    <BlurView {...blurProps} style={[styles.glass, style]}>
      {children}
    </BlurView>
  );
}

function normalizeMetrics(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return initialMetrics;
  }

  return items.map((item, index) => {
    const group =
      metricGroups.find((candidate) => candidate.id === item.categoryId) ??
      metricGroups[0];
    const createdAt = item.createdAt ?? now();

    return {
      id: item.id ?? `migrated-${index}`,
      categoryId: item.categoryId ?? group.id,
      categoryName: item.categoryName ?? group.title,
      color: item.color ?? group.color,
      name: item.name ?? "未命名指标",
      count: Number.isFinite(item.count) ? item.count : 0,
      createdAt,
      updatedAt: item.updatedAt ?? createdAt
    };
  });
}

export default function App() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTabletLayout = windowWidth >= 768;
  const [metrics, setMetrics] = useState(initialMetrics);
  const [events, setEvents] = useState([]);
  const [draftName, setDraftName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(metricGroups[0].id);
  const [activeTab, setActiveTab] = useState("record");
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [session, setSession] = useState(defaultSession);
  const [taskStarted, setTaskStarted] = useState(false);
  const [completedReports, setCompletedReports] = useState([]);
  const [cloudEndpoint, setCloudEndpoint] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [expandedReportIds, setExpandedReportIds] = useState({});
  const [newSessionModalVisible, setNewSessionModalVisible] = useState(false);
  const [newSessionDraft, setNewSessionDraft] = useState(defaultSession);
  const [dialog, setDialog] = useState(null);
  const [eventModalMetric, setEventModalMetric] = useState(null);
  const [eventSeverity, setEventSeverity] = useState("normal");
  const [eventNote, setEventNote] = useState("");
  const [problemRecords, setProblemRecords] = useState([]);
  const [problemText, setProblemText] = useState("");
  const [problemSelectedTagIds, setProblemSelectedTagIds] = useState([]);
  const [problemResult, setProblemResult] = useState("failure");
  const [customProblemTag, setCustomProblemTag] = useState("");
  const [calculatorMileage, setCalculatorMileage] = useState("");
  const [calculatorInputs, setCalculatorInputs] = useState({});
  const [routeCheckpoints, setRouteCheckpoints] = useState([]);
  const [cloudCheckpointSets, setCloudCheckpointSets] = useState([]);
  const [checkpointCloudName, setCheckpointCloudName] = useState("");
  const [checkpointCloudLoading, setCheckpointCloudLoading] = useState(false);
  const [checkpointRecords, setCheckpointRecords] = useState([]);
  const [checkpointDraftName, setCheckpointDraftName] = useState("");
  const [checkpointDraftType, setCheckpointDraftType] = useState("");
  const [checkpointDraftNote, setCheckpointDraftNote] = useState("");
  const [checkpointRadius, setCheckpointRadius] = useState("50");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentLocationUpdatedAt, setCurrentLocationUpdatedAt] = useState(null);
  const [locationStatus, setLocationStatus] = useState("未开启定位");
  const [locationDebugText, setLocationDebugText] = useState("尚未诊断");
  const [checkpointLocating, setCheckpointLocating] = useState(false);
  const [checkpointListeningEnabled, setCheckpointListeningEnabled] = useState(false);
  const [pendingCheckpoint, setPendingCheckpoint] = useState(null);
  const [checkpointPerformance, setCheckpointPerformance] = useState("normal");
  const [checkpointNote, setCheckpointNote] = useState("");
  const [checkpointCursorIndex, setCheckpointCursorIndex] = useState(0);
  const [calculatorExportTouchable, setCalculatorExportTouchable] = useState(true);
  const [navTouchable, setNavTouchable] = useState(true);
  const [statusCollapsed, setStatusCollapsed] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [startupVisible, setStartupVisible] = useState(true);
  const [taskFloatPosition, setTaskFloatPosition] = useState(() => ({
    x: windowWidth - TASK_FLOAT_COLLAPSED_WIDTH,
    y: Math.max(
      TASK_FLOAT_MARGIN,
      windowHeight - TASK_FLOAT_HEIGHT - TASK_FLOAT_BOTTOM_OFFSET
    )
  }));
  const [taskFloatDragging, setTaskFloatDragging] = useState(false);
  const [taskFloatCollapsed, setTaskFloatCollapsed] = useState(true);
  const [taskFloatSide, setTaskFloatSide] = useState("right");
  const pulseValue = useMemo(() => new Animated.Value(0), []);
  const calculatorExportValue = useMemo(() => new Animated.Value(1), []);
  const navValue = useMemo(() => new Animated.Value(1), []);
  const startupValue = useMemo(() => new Animated.Value(1), []);
  const statusValue = useMemo(() => new Animated.Value(1), []);
  const calculatorLastScrollY = useRef(0);
  const calculatorExportVisible = useRef(true);
  const navVisible = useRef(true);
  const navIdleTimer = useRef(null);
  const statusIdleTimer = useRef(null);
  const locationSubscription = useRef(null);
  const checkpointPreviewSubscription = useRef(null);
  const checkpointAlertedIds = useRef(new Set());
  const currentLocationRef = useRef(null);
  const checkpointActiveRequestId = useRef(0);
  const taskFloatPositionRef = useRef(taskFloatPosition);
  const taskFloatStartPosition = useRef(taskFloatPosition);
  const taskFloatDragged = useRef(false);
  const pageContentStyle = useMemo(
    () => [styles.scrollContent, isTabletLayout && styles.scrollContentTablet],
    [isTabletLayout]
  );
  const metricCardResponsiveStyle = useMemo(
    () => ({
      minWidth: isTabletLayout ? "31.6%" : "48%",
      width: isTabletLayout ? "31.6%" : "48.65%"
    }),
    [isTabletLayout]
  );
  const compactMetricPillResponsiveStyle = useMemo(
    () => ({
      width: isTabletLayout ? "31.6%" : "48%"
    }),
    [isTabletLayout]
  );
  const taskFloatBounds = useMemo(
    () => ({
      minX: -TASK_FLOAT_WIDTH + TASK_FLOAT_COLLAPSED_WIDTH,
      maxX: Math.max(TASK_FLOAT_MARGIN, windowWidth - TASK_FLOAT_WIDTH - TASK_FLOAT_MARGIN),
      minY: TASK_FLOAT_MARGIN,
      maxY: Math.max(
        TASK_FLOAT_MARGIN,
        windowHeight - TASK_FLOAT_HEIGHT - TASK_FLOAT_BOTTOM_OFFSET
      )
    }),
    [windowHeight, windowWidth]
  );
  const taskFloatStyle = useMemo(
    () => ({
      left: taskFloatPosition.x,
      top: taskFloatPosition.y,
      width: TASK_FLOAT_WIDTH
    }),
    [taskFloatPosition]
  );
  const taskFloatMenuStyle = useMemo(() => {
    const menuWidth = Math.min(TASK_MENU_WIDTH, windowWidth - TASK_FLOAT_MARGIN * 2);
    const preferredLeft =
      taskFloatSide === "right"
        ? taskFloatPosition.x + TASK_FLOAT_WIDTH - menuWidth
        : taskFloatPosition.x;
    const left = Math.min(
      windowWidth - menuWidth - TASK_FLOAT_MARGIN,
      Math.max(TASK_FLOAT_MARGIN, preferredLeft)
    );
    const top = Math.max(
      TASK_FLOAT_MARGIN,
      taskFloatPosition.y - TASK_MENU_ESTIMATED_HEIGHT - 8
    );
    return {
      left,
      top,
      width: menuWidth
    };
  }, [taskFloatPosition.x, taskFloatPosition.y, taskFloatSide, windowWidth]);

  function updateTaskFloatPosition(nextPosition) {
    taskFloatPositionRef.current = nextPosition;
    setTaskFloatPosition(nextPosition);
  }

  function getTaskFloatPositionForSide(side, y = taskFloatPositionRef.current.y, collapsed = taskFloatCollapsed) {
    const x =
      side === "right"
        ? collapsed
          ? windowWidth - TASK_FLOAT_COLLAPSED_WIDTH
          : taskFloatBounds.maxX
        : collapsed
          ? -TASK_FLOAT_WIDTH + TASK_FLOAT_COLLAPSED_WIDTH
          : TASK_FLOAT_MARGIN;
    return {
      x,
      y: Math.min(taskFloatBounds.maxY, Math.max(taskFloatBounds.minY, y))
    };
  }

  function setTaskFloatDock(side, y, collapsed = taskFloatCollapsed) {
    setTaskFloatSide(side);
    updateTaskFloatPosition(getTaskFloatPositionForSide(side, y, collapsed));
  }

  const taskFloatPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          taskFloatDragged.current = false;
          taskFloatStartPosition.current = taskFloatPositionRef.current;
          setTaskFloatDragging(true);
          setTaskMenuOpen(false);
          if (taskFloatCollapsed) {
            setTaskFloatCollapsed(false);
            setTaskFloatDock(taskFloatSide, taskFloatPositionRef.current.y, false);
          }
        },
        onPanResponderMove: (_, gestureState) => {
          if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
            taskFloatDragged.current = true;
          }
          const nextX = Math.min(
            taskFloatBounds.maxX,
            Math.max(taskFloatBounds.minX, taskFloatStartPosition.current.x + gestureState.dx)
          );
          const nextY = Math.min(
            taskFloatBounds.maxY,
            Math.max(taskFloatBounds.minY, taskFloatStartPosition.current.y + gestureState.dy)
          );
          updateTaskFloatPosition({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, gestureState) => {
          const releasedX = Math.min(
            taskFloatBounds.maxX,
            Math.max(taskFloatBounds.minX, taskFloatStartPosition.current.x + gestureState.dx)
          );
          const releasedY = Math.min(
            taskFloatBounds.maxY,
            Math.max(taskFloatBounds.minY, taskFloatStartPosition.current.y + gestureState.dy)
          );
          const snapX =
            releasedX + TASK_FLOAT_WIDTH / 2 > windowWidth / 2
              ? taskFloatBounds.maxX
              : taskFloatBounds.minX;
          const nextSide = snapX === taskFloatBounds.maxX ? "right" : "left";
          setTaskFloatCollapsed(true);
          setTaskFloatDock(nextSide, releasedY, true);
          setTaskFloatDragging(false);
        },
        onPanResponderTerminate: () => {
          setTaskFloatDragging(false);
        }
      }),
    [taskFloatBounds, taskFloatCollapsed, windowWidth]
  );

  const totalCount = useMemo(
    () => metrics.reduce((sum, metric) => sum + metric.count, 0),
    [metrics]
  );
  const touchedMetricCount = useMemo(
    () => metrics.filter((metric) => metric.count > 0).length,
    [metrics]
  );
  const severityStats = useMemo(
    () =>
      severityLevels.map((level) => ({
        ...level,
        count: events.filter((event) => event.severity === level.id).length
      })),
    [events]
  );
  const recentEvents = useMemo(() => events.slice(0, 80), [events]);
  const recentProblemRecords = useMemo(
    () => problemRecords.slice(0, 80),
    [problemRecords]
  );
  const selectedGroup =
    metricGroups.find((group) => group.id === selectedGroupId) ?? metricGroups[0];
  const problemTagOptions = useMemo(
    () =>
      metrics
        .map((metric) => ({
          ...metric,
          matchScore: scoreProblemTag(metric, problemText)
        }))
        .sort((first, second) => {
          if (second.matchScore !== first.matchScore) {
            return second.matchScore - first.matchScore;
          }
          return second.count - first.count;
        }),
    [metrics, problemText]
  );
  const matchedProblemTags = useMemo(
    () => problemTagOptions.filter((metric) => metric.matchScore > 0),
    [problemTagOptions]
  );
  const currentProblemTagSummary = useMemo(
    () => calculateProblemTagSummary(problemRecords),
    [problemRecords]
  );
  const currentCheckpointRecords = useMemo(
    () => checkpointRecords.filter((record) => record.sessionStartedAt === session.startedAt),
    [checkpointRecords, session.startedAt]
  );
  const orderedListeningCheckpoint = useMemo(
    () => routeCheckpoints[checkpointCursorIndex] ?? null,
    [routeCheckpoints, checkpointCursorIndex]
  );
  const checkpointRadiusValue = useMemo(() => {
    const value = parseNonNegativeNumber(checkpointRadius);
    return value === null || value <= 0 ? 50 : value;
  }, [checkpointRadius]);
  const isCheckpointRecordingTask = taskStarted && session.taskType === "checkpoint";
  const isDriveTaskStarted = taskStarted && session.taskType !== "checkpoint";
  const checkpointMonitorActive = taskStarted && checkpointListeningEnabled;
  const checkpointPreviewActive =
    activeTab === "checkpoint" || isCheckpointRecordingTask || checkpointMonitorActive;
  const checkpointLocationQuality = useMemo(
    () => getCheckpointLocationQuality(currentLocation, currentLocationUpdatedAt, locationStatus),
    [currentLocation, currentLocationUpdatedAt, locationStatus, clockTick]
  );
  const calculatorMileageValue = useMemo(
    () => parseNonNegativeNumber(calculatorMileage),
    [calculatorMileage]
  );
  const taskDuration = useMemo(
    () => formatDuration(clockTick - new Date(session.startedAt).getTime()),
    [clockTick, session.startedAt]
  );

  useEffect(() => {
    if (!taskStarted) {
      return undefined;
    }

    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [taskStarted]);

  useEffect(() => {
    if (activeTab !== "checkpoint" || taskStarted) {
      return undefined;
    }

    const timer = setInterval(() => setClockTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeTab, taskStarted]);

  useEffect(() => {
    setTaskFloatDock(taskFloatSide, taskFloatPositionRef.current.y, taskFloatCollapsed);
  }, [taskFloatBounds, taskFloatCollapsed, taskFloatSide]);

  useEffect(() => {
    if (!loaded) {
      return undefined;
    }

    const timer = setTimeout(() => {
      Animated.timing(startupValue, {
        toValue: 0,
        duration: 680,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(() => setStartupVisible(false));
    }, 520);

    return () => clearTimeout(timer);
  }, [loaded, startupValue]);

  useEffect(() => {
    if (!problemText.trim() || matchedProblemTags.length === 0) {
      return;
    }

    setProblemSelectedTagIds((current) => {
      const next = new Set(current);
      matchedProblemTags.slice(0, 4).forEach((metric) => next.add(metric.id));
      return Array.from(next);
    });
  }, [matchedProblemTags, problemText]);

  useEffect(() => {
    if (!taskStarted) {
      pulseValue.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true
        }),
        Animated.timing(pulseValue, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true
        })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseValue, taskStarted]);

  useEffect(() => {
    setNavVisible(true);
    if (activeTab === "record") {
      scheduleNavHide();
    } else if (navIdleTimer.current) {
      clearTimeout(navIdleTimer.current);
      navIdleTimer.current = null;
    }
    setStatusBarCollapsed(false);
    scheduleStatusCollapse();
    return () => {
      if (navIdleTimer.current) {
        clearTimeout(navIdleTimer.current);
      }
      if (statusIdleTimer.current) {
        clearTimeout(statusIdleTimer.current);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (!taskStarted && activeTab !== "record") {
      setTaskMenuOpen(false);
    }
  }, [activeTab, taskStarted]);

  useEffect(() => {
    checkpointAlertedIds.current = new Set(
      checkpointRecords
        .filter((record) => record.sessionStartedAt === session.startedAt)
        .map((record) => record.checkpointId)
    );
    setCheckpointCursorIndex(findNextCheckpointIndex(0));
  }, [checkpointRecords, routeCheckpoints, session.startedAt]);

  useEffect(() => {
    if (!checkpointPreviewActive) {
      if (checkpointPreviewSubscription.current) {
        checkpointPreviewSubscription.current.remove();
        checkpointPreviewSubscription.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    async function startCheckpointPreview() {
      try {
        setLocationStatus("正在检查定位权限");
        const ready = await ensureLocationReady();
        if (!ready) {
          return;
        }

        setLocationStatus("正在主动获取定位");
        requestCheckpointLocation();

        setLocationStatus("正在启动定位刷新");
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: getBestNavigationAccuracy(),
            distanceInterval: 1,
            timeInterval: 1000
          },
          (position) => {
            if (!cancelled) {
              updateCurrentLocation(position.coords, "定位已更新");
            }
          },
          (error) => {
            if (!cancelled) {
              setLocationStatus("定位刷新失败");
              setLocationDebugText(String(error?.message ?? error).slice(0, 80));
            }
          }
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        checkpointPreviewSubscription.current = subscription;
        if (!currentLocationRef.current) {
          setLocationStatus("正在主动获取定位");
        }
      } catch (error) {
        setLocationStatus(`定位启动失败：${String(error?.message ?? error).slice(0, 24)}`);
      }
    }

    startCheckpointPreview();
    return () => {
      cancelled = true;
      if (checkpointPreviewSubscription.current) {
        checkpointPreviewSubscription.current.remove();
        checkpointPreviewSubscription.current = null;
      }
    };
  }, [checkpointPreviewActive]);

  useEffect(() => {
    if (!checkpointMonitorActive) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      if (!checkpointPreviewActive) {
        setLocationStatus("未开始测试");
      }
      return undefined;
    }

    let cancelled = false;
    async function startLocationWatch() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setLocationStatus("定位权限未开启");
          showDialog({
            title: "定位权限未开启",
            message: "路线考点 demo 需要前台定位权限，开启后才能自动判断经过考点。"
          });
          return;
        }

        setLocationStatus("定位监听中");
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: getBestNavigationAccuracy(),
            distanceInterval: 2,
            timeInterval: 1000
          },
          (position) => {
            if (cancelled) {
              return;
            }
            handleLocationUpdate(position.coords);
          }
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        locationSubscription.current = subscription;
      } catch (error) {
        setLocationStatus("定位启动失败");
        showDialog({
          title: "定位启动失败",
          message: "请确认设备定位服务已打开，或稍后重新开始测试。"
        });
      }
    }

    startLocationWatch();
    return () => {
      cancelled = true;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [
    checkpointMonitorActive,
    routeCheckpoints,
    checkpointRadiusValue,
    session.startedAt,
    pendingCheckpoint,
    checkpointCursorIndex
  ]);

  const recPulseStyle = {
    opacity: pulseValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 1]
    }),
    transform: [
      {
        scale: pulseValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.85, 1.2]
        })
      }
    ]
  };
  const calculatorExportStyle = {
    opacity: calculatorExportValue,
    transform: [
      {
        translateY: calculatorExportValue.interpolate({
          inputRange: [0, 1],
          outputRange: [72, 0]
        })
      }
    ]
  };
  const navAnimatedStyle = {
    opacity: navValue,
    transform: [
      {
        translateY: navValue.interpolate({
          inputRange: [0, 1],
          outputRange: [78, 0]
        })
      }
    ]
  };
  const statusBodyStyle = {
    opacity: statusValue,
    transform: [
      {
        translateY: statusValue.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0]
        })
      }
    ]
  };
  const statusBarAnimatedStyle = {
    paddingVertical: statusValue.interpolate({
      inputRange: [0, 1],
      outputRange: [6, 10]
    })
  };
  const statusDetailAnimatedStyle = {
    maxHeight: statusValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 24]
    }),
    opacity: statusValue,
    transform: [
      {
        translateY: statusValue.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0]
        })
      }
    ]
  };
  const timerLabelAnimatedStyle = {
    maxHeight: statusValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 14]
    }),
    opacity: statusValue
  };
  const startupOverlayStyle = {
    opacity: startupValue,
    transform: [
      {
        translateY: startupValue.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 0]
        })
      },
      {
        scale: startupValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1.04, 1]
        })
      }
    ]
  };

  function animateNextLayout() {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity
      }
    });
  }

  function setNavVisible(visible) {
    if (navVisible.current === visible) {
      return;
    }

    navVisible.current = visible;
    setNavTouchable(visible);
    Animated.timing(navValue, {
      toValue: visible ? 1 : 0,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }

  function scheduleNavHide() {
    if (navIdleTimer.current) {
      clearTimeout(navIdleTimer.current);
    }

    if (activeTab !== "record" || taskMenuOpen) {
      navIdleTimer.current = null;
      return;
    }

    navIdleTimer.current = setTimeout(() => {
      setNavVisible(false);
    }, 3000);
  }

  function toggleTaskMenu() {
    setTaskMenuOpen((current) => {
      const next = !current;
      if (next && navIdleTimer.current) {
        clearTimeout(navIdleTimer.current);
        navIdleTimer.current = null;
      } else if (!next) {
        scheduleNavHide();
      }
      return next;
    });
  }

  function setStatusBarCollapsed(collapsed) {
    setStatusCollapsed(collapsed);
    Animated.timing(statusValue, {
      toValue: collapsed ? 0 : 1,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }

  function scheduleStatusCollapse() {
    if (statusIdleTimer.current) {
      clearTimeout(statusIdleTimer.current);
    }

    statusIdleTimer.current = setTimeout(() => {
      setStatusBarCollapsed(true);
    }, 3000);
  }

  function handlePageScroll(event) {
    setNavVisible(true);
    if (activeTab === "record") {
      scheduleNavHide();
    }
    if (activeTab === "calculator") {
      handleCalculatorScroll(event);
    }
  }

  function showDialog({ title, message, actions = [{ text: "知道了" }] }) {
    setDialog({ title, message, actions });
  }

  function closeDialog() {
    setDialog(null);
  }

  function runDialogAction(action) {
    closeDialog();
    action?.onPress?.();
  }

  useEffect(() => {
    async function loadSavedData() {
      try {
        const saved =
          (await AsyncStorage.getItem(STORAGE_KEY)) ??
          (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
        if (!saved) {
          setLoaded(true);
          return;
        }

        const parsed = JSON.parse(saved);
        const savedMetrics = normalizeMetrics(parsed.metrics ?? parsed.counters);
        setMetrics(savedMetrics);
        setEvents(Array.isArray(parsed.events) ? parsed.events : parsed.history ?? []);
        setProblemRecords(Array.isArray(parsed.problemRecords) ? parsed.problemRecords : []);
        setRouteCheckpoints(
          Array.isArray(parsed.routeCheckpoints) ? parsed.routeCheckpoints : []
        );
        setCheckpointRecords(
          Array.isArray(parsed.checkpointRecords) ? parsed.checkpointRecords : []
        );
        setCheckpointRadius(parsed.checkpointRadius ?? "50");
        setSelectedGroupId(parsed.selectedGroupId ?? savedMetrics[0]?.categoryId);
        setHapticsEnabled(parsed.hapticsEnabled ?? true);
        setSession({ ...defaultSession, ...(parsed.session ?? {}) });
        setTaskStarted(parsed.taskStarted ?? false);
        setCompletedReports(
          Array.isArray(parsed.completedReports) ? parsed.completedReports : []
        );
        setCalculatorMileage(parsed.calculatorMileage ?? "");
        setCalculatorInputs(parsed.calculatorInputs ?? {});
        setCloudEndpoint(parsed.cloudEndpoint ?? "");
        setSupabaseUrl(parsed.supabaseUrl ?? "");
        setSupabaseAnonKey(parsed.supabaseAnonKey ?? "");
      } catch (error) {
        showDialog({ title: "读取失败", message: "本地数据读取失败，已使用默认指标。" });
      } finally {
        setLoaded(true);
      }
    }

    loadSavedData();
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        metrics,
        events,
        problemRecords,
        routeCheckpoints,
        checkpointRecords,
        checkpointRadius,
        selectedGroupId,
        hapticsEnabled,
        session,
        taskStarted,
        completedReports,
        calculatorMileage,
        calculatorInputs,
        cloudEndpoint,
        supabaseUrl,
        supabaseAnonKey
      })
    ).catch(() => {
      showDialog({ title: "保存失败", message: "本地数据保存失败，请稍后重试。" });
    });
  }, [
    cloudEndpoint,
    checkpointRecords,
    checkpointRadius,
    calculatorInputs,
    calculatorMileage,
    completedReports,
    events,
    problemRecords,
    hapticsEnabled,
    loaded,
    metrics,
    selectedGroupId,
    session,
    taskStarted,
    routeCheckpoints,
    supabaseAnonKey,
    supabaseUrl
  ]);

  async function triggerHaptic() {
    if (!hapticsEnabled) {
      return;
    }

    try {
      if (Platform.OS === "android") {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      // Haptics can be unavailable on some devices or emulator settings.
    }
  }

  function updateCurrentLocation(coords, status = "已获取当前位置") {
    currentLocationRef.current = coords;
    setCurrentLocation(coords);
    setCurrentLocationUpdatedAt(Date.now());
    setLocationStatus(status);
    setLocationDebugText(
      `坐标 ${formatCoordinate(coords?.latitude)}, ${formatCoordinate(coords?.longitude)} · ${formatLocationAccuracy(coords)}`
    );
  }

  function formatProviderStatus(provider) {
    if (!provider) {
      return "Provider 未返回";
    }

    return [
      `服务${provider.locationServicesEnabled ? "开" : "关"}`,
      `GPS${provider.gpsAvailable === false ? "不可用" : "可用"}`,
      `网络${provider.networkAvailable === false ? "不可用" : "可用"}`,
      `被动${provider.passiveAvailable === false ? "不可用" : "可用"}`
    ].join(" / ");
  }

  async function readProviderStatus() {
    const provider = await Location.getProviderStatusAsync().catch(() => null);
    const text = formatProviderStatus(provider);
    setLocationDebugText(text);
    return provider;
  }

  async function ensureLocationReady({ showErrors = false } = {}) {
    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission =
      existingPermission.status === "granted"
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();
    setLocationDebugText(
      `权限 ${permission.status}${permission.android?.accuracy ? ` / ${permission.android.accuracy}` : ""}`
    );
    if (permission.status !== "granted") {
      setLocationStatus("定位权限未开启");
      if (showErrors) {
        showDialog({
          title: "定位权限未开启",
          message: "请在系统设置中允许 App 使用前台定位后，再记录路线考点。"
        });
      }
      return false;
    }

    setLocationStatus("定位权限已开启");
    const provider = await readProviderStatus();
    const servicesEnabled =
      provider?.locationServicesEnabled ??
      (await Location.hasServicesEnabledAsync().catch(() => true));
    if (!servicesEnabled) {
      setLocationStatus("设备定位未开启");
      if (showErrors) {
        showDialog({
          title: "设备定位未开启",
          message: "请先打开手机系统定位服务，再记录路线考点。"
        });
      }
      return false;
    }

    if (Platform.OS === "android" && Location.enableNetworkProviderAsync) {
      await Location.enableNetworkProviderAsync().catch(() => {});
    }

    return true;
  }

  async function getLastUsablePosition(maxAge = CHECKPOINT_STALE_LOCATION_MAX_AGE_MS) {
    return Location.getLastKnownPositionAsync({
      maxAge,
      requiredAccuracy: CHECKPOINT_WEAK_ACCURACY_METERS
    }).catch(() => null);
  }

  async function getFreshPosition(timeoutMs, accuracy = getBestNavigationAccuracy()) {
    return withTimeout(
      Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true
      }),
      timeoutMs,
      "checkpoint-location-timeout"
    );
  }

  async function getBestEffortCurrentPosition() {
    const attempts = [
      {
        label: "导航级",
        accuracy: getBestNavigationAccuracy(),
        timeout: CHECKPOINT_HIGH_ACCURACY_TIMEOUT_MS
      },
      { label: "高精度", accuracy: Location.Accuracy.High, timeout: 14000 },
      { label: "均衡定位", accuracy: Location.Accuracy.Balanced, timeout: CHECKPOINT_LOCATION_TIMEOUT_MS }
    ];

    let lastError = null;
    for (const attempt of attempts) {
      setLocationStatus(`正在主动获取定位-${attempt.label}`);
      setLocationDebugText(`尝试 ${attempt.label}`);
      try {
        const position = await getFreshPosition(attempt.timeout, attempt.accuracy);
        if (
          Number.isFinite(Number(position?.coords?.accuracy)) &&
          Number(position.coords.accuracy) > CHECKPOINT_WEAK_ACCURACY_METERS &&
          attempt !== attempts[attempts.length - 1]
        ) {
          lastError = new Error("location-accuracy-too-weak");
          setLocationDebugText(
            `${attempt.label}精度较弱：${formatLocationAccuracy(position.coords)}，继续尝试`
          );
          continue;
        }
        return { position, label: attempt.label };
      } catch (error) {
        lastError = error;
        setLocationDebugText(`${attempt.label}失败：${String(error?.message ?? error).slice(0, 36)}`);
      }
    }

    throw lastError ?? new Error("location-unavailable");
  }

  async function requestCheckpointLocation({ showErrors = false } = {}) {
    const requestId = checkpointActiveRequestId.current + 1;
    checkpointActiveRequestId.current = requestId;
    const ready = await ensureLocationReady({ showErrors });
    if (!ready || checkpointActiveRequestId.current !== requestId) {
      return null;
    }

    setLocationStatus("正在主动获取定位");
    const recentPosition = await getLastUsablePosition(CHECKPOINT_LAST_LOCATION_MAX_AGE_MS);
    if (checkpointActiveRequestId.current !== requestId) {
      return null;
    }
    if (recentPosition?.coords) {
      updateCurrentLocation(recentPosition.coords, "已获取最近定位");
    }

    try {
      const { position, label } = await getBestEffortCurrentPosition();
      if (checkpointActiveRequestId.current !== requestId) {
        return null;
      }
      updateCurrentLocation(position.coords, `主动定位成功-${label}`);
      return position.coords;
    } catch (error) {
      if (recentPosition?.coords) {
        setLocationStatus("使用最近定位");
        return recentPosition.coords;
      }
      setLocationStatus("主动定位失败");
      await readProviderStatus();
      if (showErrors) {
        showDialog({
          title: "主动定位失败",
          message: "没有获取到当前位置。请确认系统定位、精确位置、Expo Go 定位权限已开启，并先打开地图 App 看是否能定位。"
        });
      }
      return null;
    }
  }

  async function runLocationDiagnostics() {
    triggerHaptic();
    setLocationStatus("定位诊断中");
    const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
    const provider = await Location.getProviderStatusAsync().catch(() => null);
    const lastPosition = await getLastUsablePosition();
    const parts = [
      `权限：${permission?.status ?? "未知"}${permission?.android?.accuracy ? ` / ${permission.android.accuracy}` : ""}`,
      `Provider：${formatProviderStatus(provider)}`,
      `最近定位：${lastPosition?.coords ? `${formatCoordinate(lastPosition.coords.latitude)}, ${formatCoordinate(lastPosition.coords.longitude)} · ${formatLocationAccuracy(lastPosition.coords)}` : "无"}`
    ];
    setLocationDebugText(parts.join("；"));
    const coords = await requestCheckpointLocation({ showErrors: true });
    if (coords) {
      showDialog({
        title: "定位诊断通过",
        message: `已获取坐标：${formatCoordinate(coords.latitude)}, ${formatCoordinate(coords.longitude)} · ${formatLocationAccuracy(coords)}`
      });
    }
  }

  async function getCurrentPositionForCheckpoint() {
    return requestCheckpointLocation({ showErrors: true });
  }

  async function addRouteCheckpoint() {
    if (checkpointLocating) {
      return;
    }
    triggerHaptic();
    const name = checkpointDraftName.trim();
    if (!name) {
      showDialog({ title: "请填写考点名称", message: "打点前需要先填写考点名称。" });
      return;
    }
    setCheckpointLocating(true);
    try {
      const type = checkpointDraftType.trim() || "普通考点";
      const note = checkpointDraftNote.trim();
      const cachedCoords =
        currentLocation &&
        currentLocationUpdatedAt &&
        Date.now() - currentLocationUpdatedAt <= CHECKPOINT_LAST_LOCATION_MAX_AGE_MS &&
        Number(currentLocation.accuracy) <= CHECKPOINT_TARGET_ACCURACY_METERS
          ? currentLocation
          : null;
      const coords = cachedCoords ?? (await getCurrentPositionForCheckpoint());
      if (!coords) {
        return;
      }
      if (Number(coords.accuracy) > CHECKPOINT_WEAK_ACCURACY_METERS) {
        showDialog({
          title: "当前定位精度较弱",
          message: `当前精度约 ${formatLocationAccuracy(coords)}，建议确认车辆确实在考点附近。是否仍然保存？`,
          actions: [
            { text: "取消", variant: "ghost" },
            {
              text: "仍然保存",
              variant: "primary",
              onPress: () => saveRouteCheckpoint(name, coords, type, note)
            }
          ]
        });
        return;
      }
      saveRouteCheckpoint(name, coords, type, note);
    } catch (error) {
      setLocationStatus("定位失败");
      showDialog({
        title: error?.message === "checkpoint-location-timeout" ? "定位超时" : "打点失败",
        message:
          error?.message === "checkpoint-location-timeout"
            ? "本次没有在 9 秒内获取到定位。请确认 GPS 已开启，或走到空旷位置后再试。"
            : "没有获取到当前位置，请确认 GPS 已开启并在空旷位置重试。"
      });
    } finally {
      setCheckpointLocating(false);
    }
  }

  function saveRouteCheckpoint(name, coords, type, note) {
    const createdAt = now();
    setRouteCheckpoints((current) => [
      ...current,
      {
        id: createId("checkpoint"),
        name,
        type,
        note,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        createdAt,
        lowAccuracy: Number(coords.accuracy) > CHECKPOINT_WEAK_ACCURACY_METERS
      }
    ]);
    setCheckpointDraftName("");
    setCheckpointDraftType("");
    setCheckpointDraftNote("");
    showDialog({ title: "考点已记录", message: `已保存「${name}」当前位置。` });
  }

  function deleteRouteCheckpoint(checkpoint) {
    triggerHaptic();
    showDialog({
      title: "删除考点",
      message: `确定删除「${checkpoint.name}」吗？历史任务中的已记录表现不会被删除。`,
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "删除",
          variant: "danger",
          onPress: () => {
            setRouteCheckpoints((current) =>
              current.filter((item) => item.id !== checkpoint.id)
            );
          }
        }
      ]
    });
  }

  function getSupabaseConfigForAction() {
    const baseUrl = supabaseUrl.trim().replace(/\/+$/, "");
    const anonKey = supabaseAnonKey.trim();
    if (!baseUrl || !anonKey) {
      showDialog({
        title: "缺少 Supabase 配置",
        message: "请先到设置页填写 Supabase Project URL 和 anon public key。"
      });
      return null;
    }

    return { baseUrl, anonKey };
  }

  function getSupabaseHeaders(anonKey, prefer = "return=representation") {
    return {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: prefer
    };
  }

  function sanitizeCheckpointForCloud(checkpoint, index) {
    return {
      id: checkpoint.id || createId("checkpoint"),
      name: checkpoint.name || `考点${index + 1}`,
      type: checkpoint.type || "普通考点",
      note: checkpoint.note || "",
      latitude: Number(checkpoint.latitude),
      longitude: Number(checkpoint.longitude),
      accuracy: Number.isFinite(Number(checkpoint.accuracy))
        ? Number(checkpoint.accuracy)
        : null,
      lowAccuracy: !!checkpoint.lowAccuracy,
      createdAt: checkpoint.createdAt || now(),
      orderIndex: index
    };
  }

  function normalizeCloudCheckpoints(items, mode = "replace") {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((checkpoint, index) => {
        const latitude = Number(checkpoint.latitude);
        const longitude = Number(checkpoint.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          id:
            mode === "merge"
              ? createId("checkpoint")
              : checkpoint.id || createId("checkpoint"),
          name: checkpoint.name || `考点${index + 1}`,
          type: checkpoint.type || "普通考点",
          note: checkpoint.note || "",
          latitude,
          longitude,
          accuracy: Number.isFinite(Number(checkpoint.accuracy))
            ? Number(checkpoint.accuracy)
            : null,
          createdAt: checkpoint.createdAt || now(),
          lowAccuracy:
            checkpoint.lowAccuracy ??
            Number(checkpoint.accuracy) > CHECKPOINT_WEAK_ACCURACY_METERS
        };
      })
      .filter(Boolean);
  }

  function getCheckpointCloudName() {
    const draft = checkpointCloudName.trim();
    if (draft) {
      return draft;
    }

    const routeName =
      session.route && session.route !== "考点采集" ? session.route : "共享考点路线";
    const dateText = new Date().toLocaleDateString("zh-CN").replace(/\//g, "-");
    return `${routeName}-${dateText}`;
  }

  async function uploadCheckpointsToSupabase() {
    triggerHaptic();
    if (routeCheckpoints.length === 0) {
      showDialog({
        title: "暂无考点",
        message: "请先在第一阶段记录至少一个考点，再上传到云端。"
      });
      return;
    }

    const config = getSupabaseConfigForAction();
    if (!config) {
      return;
    }

    const checkpointSetName = getCheckpointCloudName();
    const payload = {
      id: createId("checkpoint-set"),
      name: checkpointSetName,
      route: session.route || null,
      vehicle: session.vehicle || null,
      version: session.version || null,
      staff: session.staff || null,
      checkpoint_count: routeCheckpoints.length,
      checkpoints: routeCheckpoints.map(sanitizeCheckpointForCloud),
      updated_at: now()
    };

    setCheckpointCloudLoading(true);
    try {
      const response = await fetch(`${config.baseUrl}/rest/v1/checkpoint_sets`, {
        method: "POST",
        headers: getSupabaseHeaders(config.anonKey),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      setCheckpointCloudName("");
      await fetchCheckpointSetsFromSupabase({ silent: true });
      showDialog({
        title: "上传成功",
        message: `已将「${checkpointSetName}」的 ${routeCheckpoints.length} 个考点上传到云端。`
      });
    } catch (error) {
      showDialog({
        title: "上传失败",
        message: `请确认已在 Supabase 执行 supabase-schema.sql，并检查网络和 key。\n${String(error?.message ?? error).slice(0, 160)}`
      });
    } finally {
      setCheckpointCloudLoading(false);
    }
  }

  async function fetchCheckpointSetsFromSupabase(options = {}) {
    const config = getSupabaseConfigForAction();
    if (!config) {
      return;
    }

    setCheckpointCloudLoading(true);
    try {
      const query =
        "select=id,name,route,vehicle,version,staff,checkpoint_count,created_at,updated_at&order=updated_at.desc&limit=30";
      const response = await fetch(`${config.baseUrl}/rest/v1/checkpoint_sets?${query}`, {
        method: "GET",
        headers: getSupabaseHeaders(config.anonKey, "return=minimal")
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      setCloudCheckpointSets(Array.isArray(data) ? data : []);
      if (!options.silent) {
        showDialog({
          title: "刷新完成",
          message: `已读取 ${Array.isArray(data) ? data.length : 0} 条云端考点路线。`
        });
      }
    } catch (error) {
      showDialog({
        title: "刷新失败",
        message: `没有读取到云端考点库。\n${String(error?.message ?? error).slice(0, 160)}`
      });
    } finally {
      setCheckpointCloudLoading(false);
    }
  }

  async function downloadCheckpointSetFromSupabase(checkpointSet) {
    triggerHaptic();
    const config = getSupabaseConfigForAction();
    if (!config) {
      return;
    }

    setCheckpointCloudLoading(true);
    try {
      const response = await fetch(
        `${config.baseUrl}/rest/v1/checkpoint_sets?id=eq.${encodeURIComponent(checkpointSet.id)}&select=*`,
        {
          method: "GET",
          headers: getSupabaseHeaders(config.anonKey, "return=minimal")
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      const remoteSet = Array.isArray(data) ? data[0] : null;
      const remoteCheckpoints = normalizeCloudCheckpoints(remoteSet?.checkpoints, "replace");
      if (remoteCheckpoints.length === 0) {
        showDialog({
          title: "无法导入",
          message: "这条云端路线没有可用的考点坐标。"
        });
        return;
      }

      showDialog({
        title: "导入云端考点",
        message: `「${remoteSet.name || checkpointSet.name}」包含 ${remoteCheckpoints.length} 个考点。覆盖会替换当前考点，合并会追加到最后。`,
        actions: [
          { text: "取消", variant: "ghost" },
          {
            text: "合并导入",
            variant: "ghost",
            onPress: () => {
              const merged = normalizeCloudCheckpoints(remoteSet.checkpoints, "merge");
              setRouteCheckpoints((current) => [...current, ...merged]);
            }
          },
          {
            text: "覆盖本地",
            variant: "primary",
            onPress: () => {
              setRouteCheckpoints(remoteCheckpoints);
              setCheckpointCursorIndex(0);
              checkpointAlertedIds.current = new Set();
            }
          }
        ]
      });
    } catch (error) {
      showDialog({
        title: "下载失败",
        message: `没有下载到这条考点路线。\n${String(error?.message ?? error).slice(0, 160)}`
      });
    } finally {
      setCheckpointCloudLoading(false);
    }
  }

  function findNextCheckpointIndex(startIndex = 0) {
    const safeStart = Math.max(0, startIndex);
    const nextIndex = routeCheckpoints.findIndex(
      (checkpoint, index) =>
        index >= safeStart && !checkpointAlertedIds.current.has(checkpoint.id)
    );
    return nextIndex === -1 ? routeCheckpoints.length : nextIndex;
  }

  function advanceCheckpointCursor(fromIndex = checkpointCursorIndex) {
    setCheckpointCursorIndex(findNextCheckpointIndex(fromIndex + 1));
  }

  function handleLocationUpdate(coords) {
    updateCurrentLocation(coords, "定位监听中");
    if (!checkpointListeningEnabled || !taskStarted || pendingCheckpoint || routeCheckpoints.length === 0) {
      return;
    }

    const nextIndex = findNextCheckpointIndex(checkpointCursorIndex);
    if (nextIndex !== checkpointCursorIndex) {
      setCheckpointCursorIndex(nextIndex);
    }

    const checkpoint = routeCheckpoints[nextIndex];
    if (!checkpoint) {
      return;
    }

    const distance = calculateDistanceMeters(coords, checkpoint);
    if (distance === null || distance > checkpointRadiusValue) {
      return;
    }

    checkpointAlertedIds.current.add(checkpoint.id);
    setPendingCheckpoint({ ...checkpoint, distance, sequenceIndex: nextIndex });
    setCheckpointPerformance("normal");
    setCheckpointNote("");
    triggerHaptic();
  }

  function saveCheckpointPerformance(performance = checkpointPerformance) {
    if (!pendingCheckpoint) {
      return;
    }

    const createdAt = now();
    setCheckpointRecords((current) => [
      {
        id: createId("checkpoint-record"),
        checkpointId: pendingCheckpoint.id,
        checkpointName: pendingCheckpoint.name,
        checkpointType: pendingCheckpoint.type,
        sequenceIndex: pendingCheckpoint.sequenceIndex,
        performance,
        note: checkpointNote.trim(),
        distance: pendingCheckpoint.distance,
        sessionName: session.name,
        sessionStartedAt: session.startedAt,
        route: session.route,
        vehicle: session.vehicle,
        version: session.version,
        staff: session.staff,
        createdAt
      },
      ...current
    ]);
    setPendingCheckpoint(null);
    setCheckpointNote("");
    setCheckpointPerformance("normal");
    advanceCheckpointCursor(pendingCheckpoint.sequenceIndex ?? checkpointCursorIndex);
  }

  function skipCheckpointPerformance() {
    if (pendingCheckpoint) {
      checkpointAlertedIds.current.add(pendingCheckpoint.id);
      advanceCheckpointCursor(pendingCheckpoint.sequenceIndex ?? checkpointCursorIndex);
    }
    setPendingCheckpoint(null);
    setCheckpointNote("");
  }

  function toggleCheckpointListening() {
    triggerHaptic();
    if (!taskStarted) {
      showDialog({
        title: "请先开始任务",
        message: "测试监听需要先创建任务。若只是采集考点，请选择“考点记录”任务。"
      });
      return;
    }
    if (routeCheckpoints.length === 0) {
      showDialog({
        title: "暂无考点",
        message: "请先在第一阶段记录至少一个考点，再开始测试监听。"
      });
      return;
    }

    setCheckpointListeningEnabled((current) => {
      const next = !current;
      if (next) {
        checkpointAlertedIds.current = new Set(
          checkpointRecords
            .filter((record) => record.sessionStartedAt === session.startedAt)
            .map((record) => record.checkpointId)
        );
        setCheckpointCursorIndex(findNextCheckpointIndex(0));
        setLocationStatus("准备测试监听");
      } else {
        setPendingCheckpoint(null);
        setLocationStatus("定位已更新");
      }
      return next;
    });
  }

  function updateMetric(id, updater) {
    setMetrics((current) =>
      current.map((metric) =>
        metric.id === id ? { ...updater(metric), updatedAt: now() } : metric
      )
    );
  }

  function recordEvent(metric, severity = "normal", note = "") {
    triggerHaptic();
    const createdAt = now();
    const event = {
      id: createId("event"),
      metricId: metric.id,
      metricName: metric.name,
      categoryId: metric.categoryId,
      categoryName: metric.categoryName,
      color: metric.color,
      severity,
      note: note.trim(),
      sessionName: session.name,
      route: session.route,
      vehicle: session.vehicle,
      version: session.version,
      staff: session.staff,
      previousCount: metric.count,
      nextCount: metric.count + 1,
      createdAt
    };

    updateMetric(metric.id, (current) => ({
      ...current,
      count: current.count + 1
    }));
    setEvents((current) => [event, ...current].slice(0, 2000));
  }

  function openEventModal(metric) {
    triggerHaptic();
    setEventModalMetric(metric);
    setEventSeverity("normal");
    setEventNote("");
  }

  function submitEventWithDetail() {
    if (!eventModalMetric) {
      return;
    }

    recordEvent(eventModalMetric, eventSeverity, eventNote);
    setEventModalMetric(null);
  }

  function deleteMetric(metric) {
    triggerHaptic();
    setEventModalMetric(null);
    showDialog({
      title: "删除指标",
      message: `确定删除“${metric.name}”吗？当前任务中该指标的次数和记录也会一起移除。`,
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "删除",
          variant: "danger",
          onPress: () => {
            setMetrics((current) => current.filter((item) => item.id !== metric.id));
            setEvents((current) =>
              current.filter((event) => event.metricId !== metric.id)
            );
            setProblemSelectedTagIds((current) =>
              current.filter((id) => id !== metric.id)
            );
            setProblemRecords((current) =>
              current
                .map((record) => ({
                  ...record,
                  tags: (record.tags ?? []).filter((tag) => tag.id !== metric.id)
                }))
                .filter((record) => (record.tags ?? []).length > 0)
            );
          }
        }
      ]
    });
  }

  function toggleProblemTag(metricId) {
    triggerHaptic();
    setProblemSelectedTagIds((current) =>
      current.includes(metricId)
        ? current.filter((id) => id !== metricId)
        : [...current, metricId]
    );
  }

  function addCustomProblemTag() {
    triggerHaptic();
    const name = customProblemTag.trim();
    if (!name) {
      showDialog({ title: "请输入标签", message: "请先填写要新增的问题标签名称。" });
      return;
    }

    const normalizedName = normalizeMetricName(name);
    const existingMetric = metrics.find(
      (metric) => normalizeMetricName(metric.name) === normalizedName
    );
    if (existingMetric) {
      setProblemSelectedTagIds((current) =>
        current.includes(existingMetric.id) ? current : [...current, existingMetric.id]
      );
      setCustomProblemTag("");
      return;
    }

    const createdAt = now();
    const metric = {
      id: createId("custom"),
      categoryId: selectedGroup.id,
      categoryName: selectedGroup.title,
      color: selectedGroup.color,
      name,
      count: 0,
      createdAt,
      updatedAt: createdAt
    };

    setMetrics((current) => [metric, ...current]);
    setProblemSelectedTagIds((current) => [...current, metric.id]);
    setCustomProblemTag("");
  }

  function submitProblemText() {
    triggerHaptic();
    const text = problemText.trim();
    if (!text) {
      showDialog({ title: "问题文本为空", message: "请先填写测试员观察到的问题描述。" });
      return;
    }

    const selectedMetrics = metrics.filter((metric) =>
      problemSelectedTagIds.includes(metric.id)
    );
    if (selectedMetrics.length === 0) {
      showDialog({ title: "请选择问题标签", message: "请至少选择一个自动匹配或手动添加的问题标签。" });
      return;
    }

    const createdAt = now();
    const tags = selectedMetrics.map((metric) => ({
      id: metric.id,
      name: metric.name,
      categoryId: metric.categoryId,
      categoryName: metric.categoryName,
      color: metric.color
    }));
    const record = {
      id: createId("problem"),
      text,
      result: problemResult,
      tags,
      sessionName: session.name,
      route: session.route,
      vehicle: session.vehicle,
      version: session.version,
      staff: session.staff,
      createdAt
    };

    setProblemRecords((current) => [record, ...current].slice(0, 2000));
    setProblemText("");
    setProblemSelectedTagIds([]);
    showDialog({
      title: "问题已记录",
      message: `已保存为${problemResult === "success" ? "成功" : "失败"}样本，匹配 ${selectedMetrics.length} 个标签：${tags.map((tag) => tag.name).join("、")}`
    });
  }

  function undo() {
    triggerHaptic();
    const [lastEvent, ...rest] = events;
    if (!lastEvent) {
      showDialog({ title: "无法撤回", message: "当前没有可撤回的记录。" });
      return;
    }

    updateMetric(lastEvent.metricId, (metric) => ({
      ...metric,
      count: Math.max(0, metric.count - 1)
    }));
    setEvents(rest);
  }

  function undoProblemRecord() {
    triggerHaptic();
    if (problemRecords.length === 0) {
      showDialog({ title: "无法撤回", message: "当前没有可撤回的问题样本。" });
      return;
    }

    setProblemRecords((current) => current.slice(1));
  }

  function updateCalculatorInput(metricId, field, value) {
    setCalculatorInputs((current) => ({
      ...current,
      [metricId]: {
        ...(current[metricId] ?? {}),
        [field]: value
      }
    }));
  }

  function clearCalculator() {
    triggerHaptic();
    setCalculatorInputs({});
    setCalculatorMileage("");
  }

  function setCalculatorExportVisible(visible) {
    if (calculatorExportVisible.current === visible) {
      return;
    }

    calculatorExportVisible.current = visible;
    setCalculatorExportTouchable(visible);
    Animated.timing(calculatorExportValue, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true
    }).start();
  }

  function handleCalculatorScroll(event) {
    const currentY = event.nativeEvent.contentOffset.y;
    const delta = currentY - calculatorLastScrollY.current;
    calculatorLastScrollY.current = currentY;

    if (currentY < 12) {
      setCalculatorExportVisible(true);
      return;
    }
    if (Math.abs(delta) < 8) {
      return;
    }

    setCalculatorExportVisible(delta < 0);
  }

  function getCalculatorIssues() {
    const missingMileage =
      calculatorMileageValue === null &&
      calculatedMetricItems.some((item) => {
        const input = calculatorInputs[item.id] ?? {};
        const count = parseNonNegativeNumber(input.count);
        return item.type === "distance" && count !== null && count > 0;
      });

    return calculatedMetricItems.reduce(
      (summary, item) => {
        const input = calculatorInputs[item.id] ?? {};
        const status = getCalculatedMetricStatus(
          item,
          input,
          calculatorMileageValue
        );

        if (status === "pending") {
          summary.pending.push(item.label);
        }
        if (status === "invalid") {
          summary.invalid.push(item.label);
        }
        return summary;
      },
      { pending: missingMileage ? ["本次测试总里程"] : [], invalid: [] }
    );
  }

  function formatIssueList(title, items) {
    if (items.length === 0) {
      return "";
    }

    const preview = items.slice(0, 6).join("、");
    const more = items.length > 6 ? `等${items.length}项` : `${items.length}项`;
    return `${title}：${preview}（${more}）`;
  }

  async function writeCalculatorTextFile() {
    const lines = calculatedMetricItems.map((item) =>
      formatCalculatedMetricForExport(
        item,
        calculatorInputs[item.id] ?? {},
        calculatorMileageValue
      )
    );

    const testDate = new Date().toISOString().slice(0, 10);
    const fileName = `${sanitizeFileNamePart(
      session.vehicle,
      "未填写车辆"
    )}+${sanitizeFileNamePart(session.route, "未填写路线")}+${testDate}.txt`;
    const uri = `${FileSystem.documentDirectory}${fileName}`;

    try {
      await FileSystem.writeAsStringAsync(uri, lines.join("\n"), {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/plain",
          dialogTitle: "导出指标计算结果",
          UTI: "public.plain-text"
        });
      } else {
        showDialog({ title: "导出完成", message: `文件已保存到：${uri}` });
      }
    } catch (error) {
      showDialog({ title: "导出失败", message: "请检查文件权限后重试。" });
    }
  }

  async function exportCalculatorText(skipValidation = false) {
    triggerHaptic();
    const shouldSkipValidation = skipValidation === true;
    if (calculatorMileageValue === null || calculatorMileageValue <= 0) {
      showDialog({
        title: "无法导出",
        message: "请先填写本次测试总里程，里程必须大于 0。"
      });
      return;
    }

    const issues = getCalculatorIssues();
    if (!shouldSkipValidation && (issues.pending.length > 0 || issues.invalid.length > 0)) {
      const issueMessages = [
        formatIssueList("未填写/缺少里程", issues.pending),
        formatIssueList("填写错误", issues.invalid)
      ].filter(Boolean);

      showDialog({
        title: "导出前审查",
        message: `${issueMessages.join("\n")}。\n建议检查灰色或红色高亮项；如测试员确认无误，也可以继续导出。`,
        actions: [
          { text: "返回修改", variant: "ghost" },
          { text: "仍然导出", onPress: () => exportCalculatorText(true) }
        ]
      });
      return;
    }

    await writeCalculatorTextFile();
  }

  function addMetric() {
    triggerHaptic();
    const name = draftName.trim();
    if (!name) {
      showDialog({ title: "请输入指标", message: "请先填写要记录的性能指标名称。" });
      return;
    }
    const normalizedName = normalizeMetricName(name);
    const duplicatedMetric = metrics.find(
      (metric) => normalizeMetricName(metric.name) === normalizedName
    );
    if (duplicatedMetric) {
      showDialog({
        title: "指标已存在",
        message: `“${duplicatedMetric.name}”已经在${duplicatedMetric.categoryName}中，不能重复新增。`
      });
      return;
    }

    const createdAt = now();
    const metric = {
      id: createId("custom"),
      categoryId: selectedGroup.id,
      categoryName: selectedGroup.title,
      color: selectedGroup.color,
      name,
      count: 0,
      createdAt,
      updatedAt: createdAt
    };

    setMetrics((current) => {
      const insertIndex = current.reduce(
        (lastIndex, item, index) =>
          item.categoryId === selectedGroup.id ? index + 1 : lastIndex,
        current.length
      );
      return [
        ...current.slice(0, insertIndex),
        metric,
        ...current.slice(insertIndex)
      ];
    });
    setDraftName("");
  }

  function resetAllMetrics() {
    triggerHaptic();
    if (taskStarted) {
      showDialog({
        title: "任务进行中",
        message: "当前已有正式测试任务在进行中。请先结束任务并保存数据，再清空统计。"
      });
      return;
    }

    showDialog({
      title: "清空统计",
      message: "确定将所有指标次数和问题记录清零吗？",
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "清零",
          variant: "danger",
          onPress: () => {
            setMetrics((current) =>
              current.map((metric) => ({ ...metric, count: 0, updatedAt: now() }))
            );
            setEvents([]);
            setProblemRecords([]);
          }
        }
      ]
    });
  }

  function startNewSession() {
    triggerHaptic();
    if (taskStarted) {
      showDialog({
        title: "已有任务进行中",
        message: "当前测试任务尚未结束。请先点击“结束任务”保存当前数据，再创建新任务。"
      });
      return;
    }

    showDialog({
      title: "测试前准备",
      message: [
        "请确认已完成以下事项：",
        "",
        "1. 运动相机已打开并开始录像",
        "2. 相机时间、电量和存储空间正常",
        "3. 车辆、路线、软件版本信息已填写",
        "4. 安全员/记录员已就位",
        "5. 当前任务可清零并开始新测试"
      ].join("\n"),
      actions: [
        { text: "返回检查", variant: "ghost" },
        { text: "已准备好", onPress: openNewSessionForm }
      ]
    });
  }

  function openNewSessionForm() {
    if (taskStarted) {
      showDialog({
        title: "已有任务进行中",
        message: "当前测试任务尚未结束，不能再次创建新任务。"
      });
      return;
    }

    setNewSessionDraft({
      ...session,
      name: "",
      route: "",
      vehicle: "",
      version: "",
      staff: session.staff,
      taskType: session.taskType ?? "drive",
      startMileage: "",
      endMileage: "",
      testMileage: "",
      startedAt: now()
    });
    setNewSessionModalVisible(true);
  }

  function confirmStartNewSession() {
    if (taskStarted) {
      setNewSessionModalVisible(false);
      showDialog({
        title: "已有任务进行中",
        message: "当前测试任务尚未结束，不能再次创建新任务。"
      });
      return;
    }

    const isCheckpointTask = newSessionDraft.taskType === "checkpoint";
    const requiredFields = isCheckpointTask
      ? []
      : [
          ["任务名称", newSessionDraft.name],
          ["测试路线", newSessionDraft.route],
          ["车辆编号", newSessionDraft.vehicle],
          ["软件版本", newSessionDraft.version],
          ["记录人/安全员", newSessionDraft.staff]
        ];
    const missingFields = requiredFields
      .filter(([, value]) => !value.trim())
      .map(([label]) => label);

    if (missingFields.length > 0) {
      showDialog({ title: "信息未填写完整", message: `请补充：${missingFields.join("、")}` });
      return;
    }

    const nextSession = {
      ...newSessionDraft,
      name: isCheckpointTask
        ? `考点记录 ${new Date().toLocaleString("zh-CN", {
            hour12: false,
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })}`
        : newSessionDraft.name.trim(),
      route: isCheckpointTask ? "考点采集" : newSessionDraft.route.trim(),
      vehicle: isCheckpointTask ? "未填写" : newSessionDraft.vehicle.trim(),
      version: isCheckpointTask ? "未填写" : newSessionDraft.version.trim(),
      staff: isCheckpointTask ? newSessionDraft.staff.trim() || "未填写" : newSessionDraft.staff.trim(),
      taskType: isCheckpointTask ? "checkpoint" : "drive",
      startMileage: "",
      endMileage: "",
      testMileage: "",
      startedAt: now()
    };

    showDialog({
      title: "创建新任务",
      message: "创建新任务会清零当前次数和问题记录，确定继续吗？",
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "创建",
          onPress: () => {
            setSession(nextSession);
            setTaskStarted(true);
            setCheckpointListeningEnabled(false);
            setCheckpointCursorIndex(0);
            checkpointAlertedIds.current = new Set();
            setClockTick(Date.now());
            setMetrics((current) =>
              current.map((metric) => ({ ...metric, count: 0, updatedAt: now() }))
            );
            setEvents([]);
            setProblemRecords([]);
            setNewSessionModalVisible(false);
            if (nextSession.taskType === "checkpoint") {
              setActiveTab("checkpoint");
            }
            showDialog({
              title:
                nextSession.taskType === "checkpoint"
                  ? "考点记录任务已开始"
                  : "测试任务已开始",
              message:
                nextSession.taskType === "checkpoint"
                  ? "当前仅开启定位采点，不会判断经过考点。需要验证路线时，请在考点页点击“开始测试监听”。"
                  : "请确认运动相机持续录像。需要路线考点判断时，请在考点页点击“开始测试监听”。"
            });
          }
        }
      ]
    });
  }

  function buildTaskReport(endedAt = now(), testMileageValue = session.testMileage) {
    const severitySummary = severityLevels.map((level) => ({
      id: level.id,
      label: level.label,
      count: events.filter((event) => event.severity === level.id).length
    }));
    const categorySummary = metricGroups.map((group) => {
      const groupMetrics = metrics.filter((metric) => metric.categoryId === group.id);
      return {
        id: group.id,
        title: group.title,
        total: groupMetrics.reduce((sum, metric) => sum + metric.count, 0)
      };
    });

    const sessionSnapshot = {
      ...session,
      name: session.name.trim() || "未命名测试任务",
      startMileage: "",
      endMileage: "",
      testMileage: String(testMileageValue ?? "").trim(),
      endedAt
    };
    const performanceSummary = calculatePerformanceSummary(sessionSnapshot, events);
    const problemTagSummary = calculateProblemTagSummary(
      problemRecords,
      performanceSummary.mileage
    );

    return {
      id: createId("report"),
      session: {
        ...session,
        name: session.name.trim() || "未命名测试任务",
        endedAt
      },
      session: sessionSnapshot,
      summary: {
        totalCount,
        touchedMetricCount,
        metricCount: metrics.length,
        eventCount: events.length,
        severitySummary,
        categorySummary,
        performanceSummary,
        problemRecordCount: problemRecords.length,
        problemTagSummary,
        checkpointRecordCount: currentCheckpointRecords.length
      },
      metrics: metrics.map((metric) => ({ ...metric })),
      events: events.map((event) => ({ ...event })),
      problemRecords: problemRecords.map((record) => ({ ...record })),
      checkpointRecords: currentCheckpointRecords.map((record) => ({ ...record })),
      createdAt: endedAt,
      cloudStatus:
        supabaseUrl.trim() && supabaseAnonKey.trim()
          ? "pending"
          : cloudEndpoint.trim()
            ? "pending"
            : "local_only",
      cloudUrl: ""
    };
  }

  async function uploadReportToSupabase(report) {
    const baseUrl = supabaseUrl.trim().replace(/\/$/, "");
    const anonKey = supabaseAnonKey.trim();
    if (!baseUrl || !anonKey) {
      return null;
    }

    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    const reportPayload = {
      id: report.id,
      session_name: report.session.name,
      route: report.session.route || null,
      vehicle: report.session.vehicle || null,
      version: report.session.version || null,
      staff: report.session.staff || null,
      started_at: report.session.startedAt,
      ended_at: report.session.endedAt,
      total_count: report.summary.totalCount,
      event_count: report.summary.eventCount,
      report_json: report,
      created_at: report.createdAt
    };

    try {
      const reportResponse = await fetch(`${baseUrl}/rest/v1/test_reports`, {
        method: "POST",
        headers,
        body: JSON.stringify(reportPayload)
      });

      if (!reportResponse.ok) {
        const text = await reportResponse.text();
        throw new Error(`Supabase report HTTP ${reportResponse.status}: ${text}`);
      }

      if (report.events.length > 0) {
        const eventPayload = report.events.map((event) => ({
          id: event.id,
          report_id: report.id,
          category_name: event.categoryName,
          metric_name: event.metricName,
          severity: event.severity,
          note: event.note || null,
          route: event.route || null,
          vehicle: event.vehicle || null,
          version: event.version || null,
          staff: event.staff || null,
          created_at: event.createdAt
        }));
        const eventResponse = await fetch(`${baseUrl}/rest/v1/test_events`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify(eventPayload)
        });

        if (!eventResponse.ok) {
          const text = await eventResponse.text();
          throw new Error(`Supabase events HTTP ${eventResponse.status}: ${text}`);
        }
      }

      return {
        cloudStatus: "synced",
        cloudUrl: "",
        cloudError: ""
      };
    } catch (error) {
      return {
        cloudStatus: "failed",
        cloudUrl: "",
        cloudError: String(error?.message ?? error)
      };
    }
  }

  async function uploadReportToCloud(report) {
    const supabaseResult = await uploadReportToSupabase(report);
    if (supabaseResult) {
      return supabaseResult;
    }

    const endpoint = cloudEndpoint.trim();
    if (!endpoint) {
      return { cloudStatus: "local_only", cloudUrl: "" };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(report)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }

      return {
        cloudStatus: "synced",
        cloudUrl: data.url || data.reportUrl || data.dashboardUrl || "",
        cloudError: ""
      };
    } catch (error) {
      return {
        cloudStatus: "failed",
        cloudUrl: "",
        cloudError: String(error?.message ?? error)
      };
    }
  }

  async function endCurrentTask() {
    triggerHaptic();
    if (!taskStarted) {
      showDialog({
        title: "当前未开始正式任务",
        message: "现在处于临时记录状态。请先创建并开始测试任务，再结束任务保存报告。"
      });
      return;
    }

    if (session.taskType === "checkpoint") {
      showDialog({
        title: "结束考点记录",
        message: "将停止当前考点采集任务，不会生成历史数据，也不会保存到数据页。已记录的考点会继续保留。",
        actions: [
          { text: "取消", variant: "ghost" },
          {
            text: "结束",
            onPress: () => {
              setTaskStarted(false);
              setCheckpointListeningEnabled(false);
              setPendingCheckpoint(null);
              setSession((current) => ({
                ...current,
                startedAt: now()
              }));
              showDialog({
                title: "考点记录已结束",
                message: "未生成历史数据。路线考点列表已保留，可继续用于后续测试监听。"
              });
            }
          }
        ]
      });
      return;
    }

    if (events.length === 0 && problemRecords.length === 0) {
      showDialog({ title: "没有可结束的数据", message: "当前任务还没有问题样本或事件记录。" });
      return;
    }

    showDialog({
      title: "结束当前测试任务",
      message: "将保存当前任务所有数据，并尝试同步到云端。结束后会清零当前记录。",
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "结束任务",
          onPress: async () => {
            const report = buildTaskReport(now(), "");
            setCompletedReports((current) => [report, ...current].slice(0, 80));
            setActiveTab("data");

            const cloudResult = await uploadReportToCloud(report);
            setCompletedReports((current) =>
              current.map((item) =>
                item.id === report.id ? { ...item, ...cloudResult } : item
              )
            );

            setMetrics((current) =>
              current.map((metric) => ({ ...metric, count: 0, updatedAt: now() }))
            );
            setEvents([]);
            setProblemRecords([]);
            setSession((current) => ({
              ...current,
              startMileage: "",
              endMileage: "",
              testMileage: "",
              startedAt: now()
            }));
            setTaskStarted(false);
            setCheckpointListeningEnabled(false);
            setPendingCheckpoint(null);

            if (cloudResult.cloudStatus === "synced") {
              showDialog({ title: "任务已结束", message: "数据已保存到本机，并同步到云端。" });
            } else if (cloudResult.cloudStatus === "local_only") {
              showDialog({
                title: "任务已结束",
                message: "数据已保存到本机。配置云端接口后，后续任务可自动上传。"
              });
            } else {
              showDialog({
                title: "任务已结束",
                message: "数据已保存到本机，但云端同步失败。可在数据页查看状态。"
              });
            }
          }
        }
      ]
    });
  }

  async function retryCloudSync(report) {
    triggerHaptic();
    const pendingReport = { ...report, cloudStatus: "pending", cloudError: "" };
    setCompletedReports((current) =>
      current.map((item) => (item.id === report.id ? pendingReport : item))
    );
    const cloudResult = await uploadReportToCloud(pendingReport);
    setCompletedReports((current) =>
      current.map((item) => (item.id === report.id ? { ...item, ...cloudResult } : item))
    );
  }

  function deleteCompletedReport(report) {
    triggerHaptic();
    showDialog({
      title: "删除本地任务",
      message: `确定删除“${report.session?.name || "未命名测试任务"}”吗？此操作只删除本机历史，不会删除云端数据库数据。`,
      actions: [
        { text: "取消", variant: "ghost" },
        {
          text: "删除",
          variant: "danger",
          onPress: () => {
            animateNextLayout();
            setCompletedReports((current) =>
              current.filter((item) => item.id !== report.id)
            );
            setExpandedReportIds((current) => {
              const next = { ...current };
              delete next[report.id];
              return next;
            });
          }
        }
      ]
    });
  }

  async function exportDocument() {
    triggerHaptic();
    const generatedAt = formatDate(new Date().toISOString());
    const metricRows = metrics
      .map(
        (metric) => `
          <tr>
            <td>${escapeHtml(metric.categoryName)}</td>
            <td>${escapeHtml(metric.name)}</td>
            <td class="count">${metric.count}</td>
            <td>${escapeHtml(formatDate(metric.updatedAt))}</td>
          </tr>`
      )
      .join("");
    const eventRows = events
      .map((event, index) => {
        const level =
          severityLevels.find((candidate) => candidate.id === event.severity) ??
          severityLevels[1];
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatDate(event.createdAt))}</td>
            <td>${escapeHtml(event.categoryName)}</td>
            <td>${escapeHtml(event.metricName)}</td>
            <td>${escapeHtml(level.label)}</td>
            <td>${escapeHtml(event.note || "-")}</td>
          </tr>`;
      })
      .join("");
    const problemSummaryRows = currentProblemTagSummary
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.categoryName)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td class="count">${item.total}</td>
            <td class="count">${item.success}</td>
            <td class="count">${item.failure}</td>
            <td>${escapeHtml(formatPercent(item.successRate))}</td>
            <td>${escapeHtml(formatPerformanceValue(item.mileagePerFailure))}</td>
          </tr>`
      )
      .join("");
    const problemRows = problemRecords
      .map(
        (record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatDate(record.createdAt))}</td>
            <td>${record.result === "success" ? "成功" : "失败"}</td>
            <td>${escapeHtml((record.tags ?? []).map((tag) => tag.name).join("、"))}</td>
            <td>${escapeHtml(record.text || "-")}</td>
          </tr>`
      )
      .join("");
    const sections = metricGroups
      .map((group) => {
        const groupMetrics = metrics.filter((metric) => metric.categoryId === group.id);
        const groupTotal = groupMetrics.reduce((sum, metric) => sum + metric.count, 0);
        return `
          <section>
            <h2 style="border-left-color:${group.color}">${escapeHtml(group.title)}</h2>
            <p>合计：<strong>${groupTotal}</strong> 次</p>
          </section>`;
      })
      .join("");
    const severitySummary = severityStats
      .map(
        (item) =>
          `<div class="stat"><span>${escapeHtml(item.label)}</span><b>${item.count}</b></div>`
      )
      .join("");
    const documentHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>自动驾驶性能指标报告</title>
  <style>
    body { color:#111827; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; margin:32px; line-height:1.55; }
    h1 { font-size:28px; margin:0 0 8px; }
    h2 { border-left:5px solid #1d4ed8; font-size:18px; margin:0 0 6px; padding-left:10px; }
    .meta { color:#667085; margin:0 0 24px; }
    .info, section, .stat { background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:12px 14px; }
    .grid { display:grid; gap:12px; grid-template-columns:repeat(3,1fr); margin:16px 0 24px; }
    .stat b { display:block; font-size:26px; }
    section { margin:10px 0; }
    table { border-collapse:collapse; margin-top:20px; width:100%; }
    th, td { border:1px solid #e5e7eb; padding:10px; text-align:left; vertical-align:top; }
    th { background:#f1f5f9; }
    .count { font-weight:800; text-align:right; }
  </style>
</head>
<body>
  <h1>自动驾驶性能指标报告</h1>
  <p class="meta">生成时间：${escapeHtml(generatedAt)}</p>
  <div class="info">
    <strong>测试任务：</strong>${escapeHtml(session.name)}<br />
    <strong>路线：</strong>${escapeHtml(session.route || "-")}<br />
    <strong>车辆：</strong>${escapeHtml(session.vehicle || "-")}<br />
    <strong>版本：</strong>${escapeHtml(session.version || "-")}<br />
    <strong>记录人：</strong>${escapeHtml(session.staff || "-")}<br />
    <strong>开始时间：</strong>${escapeHtml(formatDate(session.startedAt))}
  </div>
  <div class="grid">
    <div class="stat"><span>总记录次数</span><b>${totalCount}</b></div>
    <div class="stat"><span>已触发指标</span><b>${touchedMetricCount}</b></div>
    ${severitySummary}
  </div>
  ${sections}
  <h2>指标汇总</h2>
  <table>
    <thead><tr><th>指标类别</th><th>指标名称</th><th>当前次数</th><th>最后更新时间</th></tr></thead>
    <tbody>${metricRows}</tbody>
  </table>
  <h2>问题记录</h2>
  <table>
    <thead><tr><th>标签类别</th><th>标签</th><th>总样本</th><th>成功</th><th>失败</th><th>成功率</th><th>每失败里程</th></tr></thead>
    <tbody>${problemSummaryRows || '<tr><td colspan="7">暂无标签统计</td></tr>'}</tbody>
  </table>
  <h2>样本明细</h2>
  <table>
    <thead><tr><th>#</th><th>时间</th><th>结果</th><th>标签</th><th>问题文本</th></tr></thead>
    <tbody>${problemRows || '<tr><td colspan="5">暂无问题样本</td></tr>'}</tbody>
  </table>
</body>
</html>`;

    const fileName = `autodrive-report-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.html`;
    const uri = `${FileSystem.documentDirectory}${fileName}`;

    try {
      await FileSystem.writeAsStringAsync(uri, documentHtml, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/html",
          dialogTitle: "导出性能指标报告",
          UTI: "public.html"
        });
      } else {
        showDialog({ title: "导出完成", message: `文件已保存到：${uri}` });
      }
    } catch (error) {
      showDialog({ title: "导出失败", message: "请检查文件权限后重试。" });
    }
  }

  function renderMetricCard(metric) {
    return (
      <Pressable
        key={metric.id}
        style={({ pressed }) => [
          styles.metricCard,
          metricCardResponsiveStyle,
          { backgroundColor: metric.color },
          pressed && styles.cardPressed
        ]}
        onPress={() => recordEvent(metric)}
        onLongPress={() => openEventModal(metric)}
      >
        <View style={styles.metricCardHeader}>
          <Text style={styles.metricGlyph}>#</Text>
          <Text style={styles.metricName} numberOfLines={2}>
            {metric.name}
          </Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{metric.count}次</Text>
        </View>
      </Pressable>
    );
  }

  function renderTaskStatusBar() {
    return (
      <View style={styles.pinnedStatusWrap}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            const nextCollapsed = !statusCollapsed;
            setStatusBarCollapsed(nextCollapsed);
            if (!nextCollapsed) {
              scheduleStatusCollapse();
            }
          }}
        >
        <Animated.View
          style={[
            styles.taskStatusBar,
            statusBarAnimatedStyle,
            taskStarted ? styles.taskStatusActive : styles.taskStatusIdle
          ]}
        >
          <View style={styles.taskStatusMain}>
            <View style={styles.taskStatusLeft}>
              {taskStarted && <Animated.View style={[styles.recDot, recPulseStyle]} />}
              <View style={styles.taskStatusTextBlock}>
                <Text
                  style={[
                    styles.taskStatusText,
                    taskStarted ? styles.taskStatusTextActive : styles.taskStatusTextIdle
                  ]}
                >
                  {taskStarted ? "REC 正式测试进行中" : "临时记录中"}
                </Text>
                <Animated.View style={[styles.taskStatusDetailClip, statusDetailAnimatedStyle]}>
                  <Text
                    style={[
                      styles.taskStatusSubText,
                      taskStarted ? styles.taskStatusTextActive : styles.taskStatusTextIdle
                    ]}
                    numberOfLines={1}
                  >
                    {taskStarted
                      ? `${session.name} · ${session.route}`
                      : "当前数据不会归入正式任务"}
                  </Text>
                </Animated.View>
              </View>
            </View>
            <View style={styles.taskStatusRight}>
            {taskStarted && (
              <Animated.View
                style={[
                  styles.timerPill,
                  recPulseStyle
                ]}
              >
                <Animated.Text style={[styles.timerPillLabel, timerLabelAnimatedStyle]}>时长</Animated.Text>
                <Text style={styles.timerPillText}>{taskDuration}</Text>
              </Animated.View>
            )}
            </View>
          </View>
        </Animated.View>
        </Pressable>
      </View>
    );
  }

  function renderHeader() {
    return (
      <>
        <GlassView style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>自动驾驶性能指标</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {taskStarted
                ? `${session.name} · 点击快记，长按添加等级和备注`
                : "临时记录模式 · 点击快记，长按添加等级和备注"}
            </Text>
          </View>
          <View style={styles.headerStats}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{totalCount}</Text>
              <Text style={styles.statLabel}>总次数</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{touchedMetricCount}</Text>
              <Text style={styles.statLabel}>已触发</Text>
            </View>
          </View>
        </GlassView>
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backgroundTop} />
        <View style={styles.backgroundBottom} />
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          {(isDriveTaskStarted || activeTab === "record") && renderTaskStatusBar()}

          {activeTab === "record" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              {renderHeader()}

              <GlassView style={styles.editor}>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="新增指标，例如：红绿灯识别迟滞"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  returnKeyType="done"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.groupChips}
                >
                  {metricGroups.map((group) => {
                    const selected = group.id === selectedGroupId;
                    return (
                      <Pressable
                        key={group.id}
                        style={[
                          styles.groupChip,
                          selected && { backgroundColor: group.color }
                        ]}
                        onPress={() => {
                          triggerHaptic();
                          setSelectedGroupId(group.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.groupChipText,
                            selected && styles.groupChipTextActive
                          ]}
                        >
                          {group.title.replace("性能指标", "")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: selectedGroup.color },
                    pressed && styles.buttonPressed
                  ]}
                  onPress={addMetric}
                >
                  <Text style={styles.addButtonText}>加入当前类别</Text>
                </Pressable>
              </GlassView>

              <GlassView style={styles.toolbar}>
                <Pressable
                  style={({ pressed }) => [
                    styles.toolButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={undo}
                >
                  <Text style={styles.toolButtonText}>撤回</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.toolButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={exportDocument}
                >
                  <Text style={styles.toolButtonText}>导出文档</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.warnButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={resetAllMetrics}
                >
                  <Text style={styles.warnButtonText}>清零</Text>
                </Pressable>
              </GlassView>

              {metricGroups.map((group) => {
                const groupMetrics = metrics.filter(
                  (metric) => metric.categoryId === group.id
                );
                const groupTotal = groupMetrics.reduce(
                  (sum, metric) => sum + metric.count,
                  0
                );

                if (groupMetrics.length === 0) {
                  return null;
                }

                return (
                  <View key={group.id} style={styles.metricSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{group.title}</Text>
                      <Text style={[styles.sectionTotal, { color: group.color }]}>
                        {groupTotal}次
                      </Text>
                    </View>
                    <View style={styles.metricGrid}>
                      {groupMetrics.map(renderMetricCard)}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {activeTab === "timeline" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              <GlassView style={styles.settingsHeader}>
                <Text style={styles.title}>问题文本</Text>
                <Text style={styles.subtitle}>
                  输入测试员观察到的问题，系统会自动匹配标签，也可以手动选择或自定义
                </Text>
              </GlassView>

              <GlassView style={styles.problemEditor}>
                <Text style={styles.problemLabel}>问题描述</Text>
                <TextInput
                  value={problemText}
                  onChangeText={setProblemText}
                  placeholder="例如：路口左转时识别前车加塞较晚，出现一次急刹"
                  placeholderTextColor="#7c8790"
                  style={[styles.input, styles.problemInput]}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.problemMatchBar}>
                  <Text style={styles.problemMatchText}>
                    自动匹配 {matchedProblemTags.length} 个，已选择 {problemSelectedTagIds.length} 个
                  </Text>
                  <Pressable
                    style={styles.problemClearButton}
                    onPress={() => {
                      triggerHaptic();
                      setProblemSelectedTagIds([]);
                    }}
                  >
                    <Text style={styles.problemClearText}>清空选择</Text>
                  </Pressable>
                </View>
                <View style={styles.problemResultRow}>
                  {[
                    ["success", "成功样本"],
                    ["failure", "失败样本"]
                  ].map(([id, label]) => (
                    <Pressable
                      key={id}
                      style={[
                        styles.problemResultButton,
                        problemResult === id && styles.problemResultButtonActive
                      ]}
                      onPress={() => {
                        triggerHaptic();
                        setProblemResult(id);
                      }}
                    >
                      <Text
                        style={[
                          styles.problemResultText,
                          problemResult === id && styles.problemResultTextActive
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </GlassView>

              <GlassView style={styles.problemTagPanel}>
                <View style={styles.problemPanelHeader}>
                  <Text style={styles.problemPanelTitle}>问题标签</Text>
                  <Text style={styles.problemPanelHint}>高亮为自动匹配或已选择</Text>
                </View>
                <View style={styles.problemTagWrap}>
                  {problemTagOptions.map((metric) => {
                    const selected = problemSelectedTagIds.includes(metric.id);
                    const matched = metric.matchScore > 0;
                    return (
                      <Pressable
                        key={metric.id}
                        style={[
                          styles.problemTag,
                          selected && { backgroundColor: metric.color, borderColor: metric.color },
                          !selected && matched && styles.problemTagMatched
                        ]}
                        onPress={() => toggleProblemTag(metric.id)}
                      >
                        <Text
                          style={[
                            styles.problemTagText,
                            selected && styles.problemTagTextActive
                          ]}
                          numberOfLines={1}
                        >
                          {metric.name}
                        </Text>
                        {matched && !selected && (
                          <Text style={styles.problemTagScore}>推荐</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </GlassView>

              <GlassView style={styles.problemCustomCard}>
                <Text style={styles.problemLabel}>自定义标签</Text>
                <View style={styles.problemCustomRow}>
                  <TextInput
                    value={customProblemTag}
                    onChangeText={setCustomProblemTag}
                    placeholder="例如：导航路线偏移"
                    placeholderTextColor="#7c8790"
                    style={[styles.input, styles.problemCustomInput]}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.problemAddButton,
                      { backgroundColor: selectedGroup.color },
                      pressed && styles.buttonPressed
                    ]}
                    onPress={addCustomProblemTag}
                  >
                    <Text style={styles.problemAddText}>加入</Text>
                  </Pressable>
                </View>
              </GlassView>

              <Pressable
                style={({ pressed }) => [
                  styles.problemSubmitButton,
                  pressed && styles.buttonPressed
                ]}
                onPress={submitProblemText}
              >
                <Text style={styles.problemSubmitText}>保存样本</Text>
              </Pressable>

              <GlassView style={styles.problemRecentCard}>
                <View style={styles.problemPanelHeader}>
                  <Text style={styles.problemPanelTitle}>当前任务统计</Text>
                  <Pressable style={styles.problemClearButton} onPress={undoProblemRecord}>
                    <Text style={styles.problemClearText}>撤回样本</Text>
                  </Pressable>
                </View>
                {currentProblemTagSummary.length === 0 ? (
                  <Text style={styles.emptyText}>暂无样本统计。</Text>
                ) : (
                  currentProblemTagSummary.map((item) => (
                    <View key={item.id} style={styles.problemMetricRow}>
                      <View style={[styles.metricDetailColor, { backgroundColor: item.color }]} />
                      <View style={styles.eventBody}>
                        <Text style={styles.eventTitle}>{item.name}</Text>
                        <Text style={styles.eventMeta}>
                          总 {item.total} · 成功 {item.success} · 失败 {item.failure} · 成功率 {formatPercent(item.successRate)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </GlassView>

              <GlassView style={styles.problemRecentCard}>
                <Text style={styles.problemPanelTitle}>最近记录</Text>
                {recentProblemRecords.length === 0 ? (
                  <Text style={styles.emptyText}>暂无问题记录。</Text>
                ) : (
                  recentProblemRecords.slice(0, 8).map((record) => (
                    <View key={record.id} style={styles.problemRecentItem}>
                      <View
                        style={[
                          styles.eventColor,
                          {
                            backgroundColor:
                              record.result === "success" ? "#16a34a" : "#dc2626"
                          }
                        ]}
                      />
                      <View style={styles.eventBody}>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {record.result === "success" ? "成功" : "失败"} · {(record.tags ?? []).map((tag) => tag.name).join("、")}
                        </Text>
                        <Text style={styles.eventMeta}>
                          {formatDate(record.createdAt)}
                        </Text>
                        {!!record.text && (
                          <Text style={styles.eventNote} numberOfLines={2}>
                            {record.text}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </GlassView>
            </ScrollView>
          )}

          {activeTab === "checkpoint" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              <GlassView style={styles.settingsHeader}>
                <Text style={styles.title}>路线考点</Text>
                <Text style={styles.subtitle}>
                  Demo 分为两个阶段：先记录考点；开始正式测试后才开启定位监听并判断是否经过考点。
                </Text>
              </GlassView>

              <GlassView style={styles.formCard}>
                <View style={styles.checkpointStageHeader}>
                  <Text style={styles.checkpointStageBadge}>第一阶段</Text>
                  <Text style={styles.settingTitle}>记录考点</Text>
                </View>
                <Text style={styles.settingDesc}>
                  这一阶段不需要开始测试。进入页面后会先预热定位，到达考点附近后填写名称并保存最近一次有效坐标。
                </Text>
                <View style={styles.locationWarmupCard}>
                  <View style={styles.locationWarmupTop}>
                    <View style={styles.settingText}>
                      <Text style={styles.locationWarmupTitle}>定位状态</Text>
                      <Text style={styles.locationWarmupDesc}>
                        {locationStatus} · {checkpointLocationQuality.description}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.locationQualityBadge,
                        checkpointLocationQuality.tone === "ready" &&
                          styles.locationQualityReady,
                        checkpointLocationQuality.tone === "warning" &&
                          styles.locationQualityWarning,
                        checkpointLocationQuality.tone === "failed" &&
                          styles.locationQualityFailed
                      ]}
                    >
                      {checkpointLocationQuality.label}
                    </Text>
                  </View>
                  <Text style={styles.checkpointCoordinateText}>
                    当前：{formatCoordinate(currentLocation?.latitude)}, {formatCoordinate(currentLocation?.longitude)} · {formatLocationAccuracy(currentLocation)}
                  </Text>
                  <Text style={styles.locationDebugText} numberOfLines={3}>
                    诊断：{locationDebugText}
                  </Text>
                  <View style={styles.locationActionRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.locationMiniButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={() => requestCheckpointLocation({ showErrors: true })}
                    >
                      <Text style={styles.locationMiniButtonText}>重新定位</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.locationMiniButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={runLocationDiagnostics}
                    >
                      <Text style={styles.locationMiniButtonText}>定位诊断</Text>
                    </Pressable>
                  </View>
                </View>
                <TextInput
                  value={checkpointDraftName}
                  onChangeText={setCheckpointDraftName}
                  placeholder="考点名称，例如：环岛入口"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                />
                <TextInput
                  value={checkpointDraftType}
                  onChangeText={setCheckpointDraftType}
                  placeholder="考点类型，例如：路口 / 施工 / 绕行"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                />
                <TextInput
                  value={checkpointDraftNote}
                  onChangeText={setCheckpointDraftNote}
                  placeholder="备注，可不填"
                  placeholderTextColor="#7c8790"
                  style={[styles.input, styles.noteInput]}
                  multiline
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.problemSubmitButton,
                    checkpointLocating && styles.buttonDisabled,
                    pressed && !checkpointLocating && styles.buttonPressed
                  ]}
                  onPress={addRouteCheckpoint}
                  disabled={checkpointLocating}
                >
                  <Text style={styles.problemSubmitText}>
                    {checkpointLocating ? "正在定位..." : "保存当前定位为考点"}
                  </Text>
                </Pressable>
                {isCheckpointRecordingTask && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalGhostButton,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={endCurrentTask}
                  >
                    <Text style={styles.modalGhostText}>结束考点记录</Text>
                  </Pressable>
                )}
              </GlassView>

              <GlassView style={styles.problemRecentCard}>
                <View style={styles.problemPanelHeader}>
                  <Text style={styles.problemPanelTitle}>已记录考点</Text>
                  <Text style={styles.problemPanelHint}>{routeCheckpoints.length} 个</Text>
                </View>
                {routeCheckpoints.length === 0 ? (
                  <Text style={styles.emptyText}>暂无考点。先到考点附近进行一次打点。</Text>
                ) : (
                  routeCheckpoints.map((checkpoint, index) => {
                    const distance = calculateDistanceMeters(currentLocation, checkpoint);
                    return (
                      <View key={checkpoint.id} style={styles.checkpointItem}>
                        <View style={styles.checkpointIndex}>
                          <Text style={styles.checkpointIndexText}>{index + 1}</Text>
                        </View>
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {checkpoint.name}
                          </Text>
                          <Text style={styles.eventMeta}>
                            {checkpoint.type} · {formatCoordinate(checkpoint.latitude)}, {formatCoordinate(checkpoint.longitude)}
                          </Text>
                          <Text style={styles.eventNote} numberOfLines={1}>
                            {distance === null ? "距离待定位" : `距当前位置 ${Math.round(distance)}m`}
                            {` · 精度 ${formatLocationAccuracy(checkpoint)}`}
                            {checkpoint.lowAccuracy ? " · 低精度" : ""}
                            {checkpoint.note ? ` · ${checkpoint.note}` : ""}
                          </Text>
                        </View>
                        {index === checkpointCursorIndex && checkpointListeningEnabled && (
                          <Text style={[styles.statusBadge, styles.statusSynced]}>监听</Text>
                        )}
                        <Pressable
                          style={styles.reportDeleteButton}
                          onPress={() => deleteRouteCheckpoint(checkpoint)}
                        >
                          <Text style={styles.reportDeleteText}>删除</Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </GlassView>

              <GlassView style={styles.problemRecentCard}>
                <View style={styles.problemPanelHeader}>
                  <View style={styles.eventBody}>
                    <Text style={styles.problemPanelTitle}>云端考点库</Text>
                    <Text style={styles.settingDesc}>
                      上传当前考点路线，其他测试员填写同一套 Supabase 配置后可刷新并下载。
                    </Text>
                  </View>
                  <Text style={[styles.statusBadge, styles.statusLocal]}>
                    {checkpointCloudLoading ? "同步中" : "共享"}
                  </Text>
                </View>
                <TextInput
                  value={checkpointCloudName}
                  onChangeText={setCheckpointCloudName}
                  placeholder="云端路线名称，留空则自动生成"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                />
                <View style={styles.checkpointCloudActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.checkpointCloudButton,
                      checkpointCloudLoading && styles.buttonDisabled,
                      pressed && !checkpointCloudLoading && styles.buttonPressed
                    ]}
                    onPress={uploadCheckpointsToSupabase}
                    disabled={checkpointCloudLoading}
                  >
                    <Text style={styles.checkpointCloudButtonText}>上传当前考点</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.checkpointCloudButtonGhost,
                      checkpointCloudLoading && styles.buttonDisabled,
                      pressed && !checkpointCloudLoading && styles.buttonPressed
                    ]}
                    onPress={() => fetchCheckpointSetsFromSupabase()}
                    disabled={checkpointCloudLoading}
                  >
                    <Text style={styles.checkpointCloudButtonGhostText}>刷新云端</Text>
                  </Pressable>
                </View>
                {cloudCheckpointSets.length === 0 ? (
                  <Text style={styles.emptyText}>
                    暂无云端路线。首次使用前请先在 Supabase 执行项目里的 supabase-schema.sql。
                  </Text>
                ) : (
                  <View style={styles.checkpointCloudList}>
                    {cloudCheckpointSets.map((checkpointSet) => (
                      <View key={checkpointSet.id} style={styles.checkpointCloudItem}>
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {checkpointSet.name || "未命名考点路线"}
                          </Text>
                          <Text style={styles.eventMeta} numberOfLines={1}>
                            {checkpointSet.route || "未填写路线"} · {checkpointSet.checkpoint_count ?? 0} 个考点
                          </Text>
                          <Text style={styles.eventNote} numberOfLines={1}>
                            更新：{formatDate(checkpointSet.updated_at || checkpointSet.created_at)}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.reportActionButton}
                          onPress={() => downloadCheckpointSetFromSupabase(checkpointSet)}
                        >
                          <Text style={styles.reportActionText}>下载</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </GlassView>

              <GlassView style={styles.checkpointStatusCard}>
                <View style={styles.checkpointStageHeader}>
                  <Text style={styles.checkpointStageBadge}>第二阶段</Text>
                  <Text style={styles.settingTitle}>测试监听</Text>
                </View>
                <Text style={styles.settingDesc}>
                  只有点击下方按钮后，App 才会按照考点添加顺序判断是否经过考点；考点记录任务默认只采集定位，不会自动触发弹窗。
                </Text>
                <View style={styles.checkpointStatusTop}>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>监听状态</Text>
                    <Text style={styles.settingDesc}>
                      {checkpointListeningEnabled
                        ? locationStatus
                        : taskStarted
                          ? "任务已开始，测试监听未开启"
                          : "未开始任务，不会监听考点"} · 触发半径 {checkpointRadiusValue}m
                    </Text>
                  </View>
                  <Text style={[styles.statusBadge, checkpointListeningEnabled ? styles.statusSynced : styles.statusLocal]}>
                    {checkpointListeningEnabled ? "监听中" : "未监听"}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    checkpointListeningEnabled
                      ? styles.modalGhostButton
                      : styles.modalPrimaryButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={toggleCheckpointListening}
                >
                  <Text
                    style={
                      checkpointListeningEnabled
                        ? styles.modalGhostText
                        : styles.modalPrimaryText
                    }
                  >
                    {checkpointListeningEnabled ? "停止测试监听" : "开始测试监听"}
                  </Text>
                </Pressable>
                <Text style={styles.checkpointCoordinateText}>
                  当前：{formatCoordinate(currentLocation?.latitude)}, {formatCoordinate(currentLocation?.longitude)}
                </Text>
                <View style={styles.checkpointOrderBox}>
                  <Text style={styles.checkpointOrderTitle}>当前监听顺序</Text>
                  <Text style={styles.checkpointOrderText} numberOfLines={2}>
                    {routeCheckpoints.length === 0
                      ? "暂无考点"
                      : orderedListeningCheckpoint
                        ? `第 ${checkpointCursorIndex + 1} 个：${orderedListeningCheckpoint.name}`
                        : "全部考点已处理"}
                  </Text>
                </View>
                <TextInput
                  value={checkpointRadius}
                  onChangeText={setCheckpointRadius}
                  placeholder="触发半径，默认 50m"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </GlassView>

              <GlassView style={styles.problemRecentCard}>
                <View style={styles.problemPanelHeader}>
                  <Text style={styles.problemPanelTitle}>本次测试考点表现</Text>
                  <Text style={styles.problemPanelHint}>{currentCheckpointRecords.length} 条</Text>
                </View>
                {currentCheckpointRecords.length === 0 ? (
                  <Text style={styles.emptyText}>开始测试后，经过考点会在这里记录表现。</Text>
                ) : (
                  currentCheckpointRecords.map((record) => {
                    const performance = getCheckpointPerformanceOption(record.performance);
                    return (
                      <View key={record.id} style={styles.problemRecentItem}>
                        <View
                          style={[
                            styles.eventColor,
                            {
                              backgroundColor: performance.color
                            }
                          ]}
                        />
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {record.checkpointName} · {performance.label}
                          </Text>
                          <Text style={styles.eventMeta}>
                            {formatDate(record.createdAt)} · 触发距离 {Math.round(record.distance ?? 0)}m
                          </Text>
                          {!!record.note && (
                            <Text style={styles.eventNote} numberOfLines={2}>
                              {record.note}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </GlassView>
            </ScrollView>
          )}

          {activeTab === "data" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              <GlassView style={styles.settingsHeader}>
                <Text style={styles.title}>数据</Text>
                <Text style={styles.subtitle}>
                  查看已结束任务的标签统计、本机保存和云端同步状态
                </Text>
              </GlassView>

              {completedReports.length === 0 ? (
                <GlassView style={styles.emptyCard}>
                  <Text style={styles.emptyText}>暂无已结束任务。回到记录页点击悬浮的“结束”按钮后会自动保存到这里。</Text>
                </GlassView>
              ) : (
                completedReports.map((report) => {
                  const expanded = !!expandedReportIds[report.id];
                  const statusText =
                    report.cloudStatus === "synced"
                      ? "已同步"
                      : report.cloudStatus === "pending"
                        ? "同步中"
                        : report.cloudStatus === "failed"
                          ? "同步失败"
                          : "仅本地";
                  const statusStyle =
                    report.cloudStatus === "synced"
                      ? styles.statusSynced
                      : report.cloudStatus === "failed"
                        ? styles.statusFailed
                        : styles.statusLocal;

                  return (
                    <GlassView key={report.id} style={styles.reportCard}>
                      <Pressable
                        style={styles.reportHeader}
                        onPress={() => {
                          animateNextLayout();
                          setExpandedReportIds((current) => ({
                            ...current,
                            [report.id]: !current[report.id]
                          }));
                        }}
                      >
                        <View style={styles.reportTitleBlock}>
                          <View style={styles.reportTitleRow}>
                            <Text style={styles.reportTitle} numberOfLines={1}>
                              {report.session?.name || "未命名测试任务"}
                            </Text>
                            <Text style={styles.expandHint}>{expanded ? "收起" : "展开"}</Text>
                          </View>
                          <Text style={styles.reportMeta}>
                            {formatDate(report.createdAt)} · {report.session?.route || "未填写路线"}
                          </Text>
                        </View>
                        <Text style={[styles.statusBadge, statusStyle]}>{statusText}</Text>
                      </Pressable>
                      {expanded && (
                        <View style={styles.reportMetricList}>
                          <Text style={styles.reportDetailSectionTitle}>指标次数</Text>
                          <View style={styles.compactMetricGrid}>
                            {sortMetricsForDisplay(report.metrics).map((metric) => (
                              <View
                                key={metric.id}
                                style={[
                                  styles.compactMetricPill,
                                  compactMetricPillResponsiveStyle
                                ]}
                              >
                                <View
                                  style={[
                                    styles.compactMetricDot,
                                    { backgroundColor: metric.color }
                                  ]}
                                />
                                <Text style={styles.compactMetricName} numberOfLines={1}>
                                  {metric.name}
                                </Text>
                                <Text style={styles.compactMetricCount}>{metric.count}</Text>
                              </View>
                            ))}
                          </View>
                          {(report.summary?.problemTagSummary ?? []).length > 0 && (
                            <View style={styles.compactProblemSummary}>
                              <Text style={styles.compactProblemText} numberOfLines={2}>
                                问题样本：
                                {(report.summary?.problemTagSummary ?? [])
                                  .slice(0, 4)
                                  .map(
                                    (item) =>
                                      `${item.name} ${formatPercent(item.successRate)}`
                                  )
                                  .join(" · ")}
                              </Text>
                              {(report.summary?.problemTagSummary ?? []).length > 4 && (
                                <Text style={styles.compactProblemMore}>
                                  另 {(report.summary?.problemTagSummary ?? []).length - 4} 项
                                </Text>
                              )}
                            </View>
                          )}
                          {(report.checkpointRecords ?? []).length > 0 && (
                            <View style={styles.reportCheckpointSection}>
                              <View style={styles.reportCheckpointHeader}>
                                <Text style={styles.reportDetailSectionTitle}>考点表现</Text>
                                <Text style={styles.problemPanelHint}>
                                  {(report.checkpointRecords ?? []).length} 项
                                </Text>
                              </View>
                              {sortCheckpointRecordsForDisplay(report.checkpointRecords).map(
                                (record, index) => {
                                  const performance = getCheckpointPerformanceOption(
                                    record.performance
                                  );
                                  return (
                                    <View key={record.id} style={styles.reportCheckpointItem}>
                                      <View style={styles.reportCheckpointIndex}>
                                        <Text style={styles.reportCheckpointIndexText}>
                                          {Number.isFinite(record.sequenceIndex)
                                            ? record.sequenceIndex + 1
                                            : index + 1}
                                        </Text>
                                      </View>
                                      <View style={styles.eventBody}>
                                        <Text style={styles.reportCheckpointTitle} numberOfLines={1}>
                                          {record.checkpointName || "未命名考点"}
                                        </Text>
                                        <Text style={styles.reportCheckpointMeta} numberOfLines={1}>
                                          {record.checkpointType || "普通考点"} · 触发距离 {Math.round(record.distance ?? 0)}m
                                        </Text>
                                        {!!record.note && (
                                          <Text style={styles.reportCheckpointNote} numberOfLines={2}>
                                            {record.note}
                                          </Text>
                                        )}
                                      </View>
                                      <Text
                                        style={[
                                          styles.reportCheckpointBadge,
                                          { color: performance.color }
                                        ]}
                                      >
                                        {performance.label}
                                      </Text>
                                    </View>
                                  );
                                }
                              )}
                            </View>
                          )}
                        </View>
                      )}
                      {!!report.cloudError && (
                        <Text style={styles.reportError} numberOfLines={2}>
                          {report.cloudError}
                        </Text>
                      )}
                      <View style={styles.reportActions}>
                        {report.cloudStatus === "failed" && (
                          <Pressable
                            style={styles.reportActionButton}
                            onPress={() => retryCloudSync(report)}
                          >
                            <Text style={styles.reportActionText}>重试同步</Text>
                          </Pressable>
                        )}
                        {!!report.cloudUrl && (
                          <Pressable
                            style={styles.reportActionButton}
                            onPress={() => Linking.openURL(report.cloudUrl)}
                          >
                            <Text style={styles.reportActionText}>打开云端</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.reportDeleteButton}
                          onPress={() => deleteCompletedReport(report)}
                        >
                          <Text style={styles.reportDeleteText}>删除</Text>
                        </Pressable>
                      </View>
                    </GlassView>
                  );
                })
              )}
            </ScrollView>
          )}

          {activeTab === "calculator" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              <GlassView style={styles.settingsHeader}>
                <Text style={styles.title}>指标计算</Text>
                <Text style={styles.subtitle}>
                  按测试后表格录入次数，自动计算 km/次、成功率和失败率
                </Text>
              </GlassView>

              <GlassView style={styles.calculatorCard}>
                <View style={styles.calculatorHeader}>
                  <View style={styles.eventBody}>
                    <Text style={styles.problemPanelTitle}>测试里程</Text>
                    <Text style={styles.subtitle}>
                      km/次 指标会使用总里程除以对应次数；成功率指标填写成功次数和总次数
                    </Text>
                  </View>
                  <Pressable style={styles.problemClearButton} onPress={clearCalculator}>
                    <Text style={styles.problemClearText}>清空</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={calculatorMileage}
                  onChangeText={setCalculatorMileage}
                  placeholder="本次测试总里程 km，例如 86.5"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </GlassView>

              <GlassView style={styles.calculatorCard}>
                <View style={styles.calculatorList}>
                  {calculatedMetricItems.map((item) => {
                    const input = calculatorInputs[item.id] ?? {};
                    const result = formatCalculatedMetric(
                      item,
                      input,
                      calculatorMileageValue
                    );
                    const metricStatus = getCalculatedMetricStatus(
                      item,
                      input,
                      calculatorMileageValue
                    );
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.calculatorRow,
                          metricStatus === "invalid" && styles.calculatorRowInvalid
                        ]}
                      >
                        <View style={styles.calculatorTitleBlock}>
                          <Text style={styles.calculatorMetricName}>{item.label}</Text>
                          <Text style={styles.calculatorMetricUnit}>{item.unit}</Text>
                        </View>
                        {item.type === "rate" ? (
                          <View style={styles.calculatorInputs}>
                            <TextInput
                              value={input.success ?? ""}
                              onChangeText={(value) =>
                                updateCalculatorInput(item.id, "success", value)
                              }
                              placeholder="成功"
                              placeholderTextColor="#98a2b3"
                              style={styles.calculatorInput}
                              keyboardType="decimal-pad"
                            />
                            <TextInput
                              value={input.total ?? ""}
                              onChangeText={(value) =>
                                updateCalculatorInput(item.id, "total", value)
                              }
                              placeholder="总数"
                              placeholderTextColor="#98a2b3"
                              style={styles.calculatorInput}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        ) : (
                          <View style={styles.calculatorInputs}>
                            <TextInput
                              value={input.count ?? ""}
                              onChangeText={(value) =>
                                updateCalculatorInput(item.id, "count", value)
                              }
                              placeholder={item.countLabel}
                              placeholderTextColor="#98a2b3"
                              style={styles.calculatorWideInput}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        )}
                        <View
                          style={[
                            styles.calculatorResult,
                            metricStatus === "complete" && styles.calculatorResultComplete,
                            metricStatus === "pending" && styles.calculatorResultPending,
                            metricStatus === "empty" && styles.calculatorResultEmpty,
                            metricStatus === "invalid" && styles.calculatorResultInvalid
                          ]}
                        >
                          <Text
                            style={[
                              styles.calculatorResultText,
                              metricStatus === "complete" && styles.calculatorResultCompleteText,
                              metricStatus === "pending" && styles.calculatorResultPendingText,
                              metricStatus === "empty" && styles.calculatorResultEmptyText,
                              metricStatus === "invalid" && styles.calculatorResultInvalidText
                            ]}
                          >
                            {result}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </GlassView>
            </ScrollView>
          )}

          {activeTab === "settings" && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={pageContentStyle}
              onScroll={handlePageScroll}
              scrollEventThrottle={16}
            >
              <GlassView style={styles.settingsHeader}>
                <Text style={styles.title}>设置</Text>
                <Text style={styles.subtitle}>管理测试任务、记录反馈、导出报告和统计数据</Text>
              </GlassView>

              <GlassView style={styles.settingCard}>
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>轻微震动反馈</Text>
                  <Text style={styles.settingDesc}>点击指标卡片和操作按钮时给出短促反馈</Text>
                </View>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={(value) => {
                    setHapticsEnabled(value);
                    if (value) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }
                  }}
                  trackColor={{ false: "#d0d5dd", true: "#bfdbfe" }}
                  thumbColor={hapticsEnabled ? "#1d4ed8" : "#f8fafc"}
                />
              </GlassView>

              <GlassView style={styles.settingCard}>
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>导出文档报告</Text>
                  <Text style={styles.settingDesc}>包含任务信息、分类统计、严重程度和问题记录</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.settingButtonSmall,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={exportDocument}
                >
                  <Text style={styles.settingButtonText}>导出</Text>
                </Pressable>
              </GlassView>

              <GlassView style={styles.formCard}>
                <Text style={styles.settingTitle}>Supabase 数据库</Text>
                <Text style={styles.settingDesc}>
                  填写 Project URL 和 anon key 后，结束任务会写入 test_reports / test_events。
                </Text>
                <TextInput
                  value={supabaseUrl}
                  onChangeText={setSupabaseUrl}
                  placeholder="https://xxxx.supabase.co"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={supabaseAnonKey}
                  onChangeText={setSupabaseAnonKey}
                  placeholder="Supabase anon public key"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </GlassView>

              <GlassView style={styles.formCard}>
                <Text style={styles.settingTitle}>备用云端接口</Text>
                <Text style={styles.settingDesc}>
                  如果不使用 Supabase，可填写自定义 POST 接口。Supabase 配置优先。
                </Text>
                <TextInput
                  value={cloudEndpoint}
                  onChangeText={setCloudEndpoint}
                  placeholder="https://your-server.com/api/reports"
                  placeholderTextColor="#7c8790"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </GlassView>

              <GlassView style={styles.settingCard}>
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>统计概览</Text>
                  <Text style={styles.settingDesc}>
                    共 {metrics.length} 个指标，已记录 {totalCount} 次，已触发
                    {touchedMetricCount} 个指标，严重事件
                    {severityStats.find((item) => item.id === "critical")?.count ?? 0} 次
                  </Text>
                </View>
              </GlassView>

              <GlassView style={styles.settingCard}>
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>清空当前统计</Text>
                  <Text style={styles.settingDesc}>清零次数和问题记录，不删除指标卡片</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.settingDangerButton,
                    pressed && styles.buttonPressed
                  ]}
                  onPress={resetAllMetrics}
                >
                  <Text style={styles.settingDangerText}>清零</Text>
                </Pressable>
              </GlassView>
            </ScrollView>
          )}

          {activeTab === "calculator" && (
            <Animated.View
              pointerEvents={calculatorExportTouchable ? "auto" : "none"}
              style={[styles.calculatorFloatingExportWrap, calculatorExportStyle]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.calculatorFloatingExportButton,
                  pressed && styles.buttonPressed
                ]}
                onPress={() => exportCalculatorText()}
              >
                <Text style={styles.calculatorExportText}>导出TXT计算结果</Text>
              </Pressable>
            </Animated.View>
          )}

          {taskMenuOpen && (
            <GlassView style={[styles.taskMenu, taskFloatMenuStyle]}>
                <Text style={styles.taskMenuTitle} numberOfLines={1}>
                  {taskStarted ? session.name || "未命名测试任务" : "当前无进行中任务"}
                </Text>
                <Text style={styles.taskMenuDesc} numberOfLines={1}>
                  {taskStarted
                    ? `${session.taskType === "checkpoint" ? "考点记录" : `${problemRecords.length} 条样本`} · ${session.route || "未填写路线"}`
                    : "可以创建行车测试或考点记录任务"}
                </Text>
                <View style={styles.taskMenuActions}>
                  {taskStarted ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.taskMenuPrimaryButton,
                        styles.taskMenuEndButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={() => {
                        setTaskMenuOpen(false);
                        endCurrentTask();
                      }}
                    >
                      <Text style={styles.taskMenuPrimaryText}>结束任务</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        styles.taskMenuPrimaryButton,
                        pressed && styles.buttonPressed
                      ]}
                      onPress={() => {
                        setTaskMenuOpen(false);
                        startNewSession();
                      }}
                    >
                      <Text style={styles.taskMenuPrimaryText}>新任务</Text>
                    </Pressable>
                  )}
                </View>
              </GlassView>
            )}
          <View
            style={[styles.globalTaskDock, taskFloatStyle]}
            {...taskFloatPanResponder.panHandlers}
          >
            <Pressable
              style={({ pressed }) => [
                styles.globalTaskButton,
                taskFloatCollapsed && styles.globalTaskButtonCollapsed,
                taskStarted && styles.globalTaskButtonActive,
                taskMenuOpen && styles.globalTaskButtonOpen,
                taskFloatDragging && styles.globalTaskButtonDragging,
                pressed && styles.buttonPressed
              ]}
              onPress={() => {
                if (taskFloatDragged.current) {
                  taskFloatDragged.current = false;
                  return;
                }
                triggerHaptic();
                if (taskFloatCollapsed) {
                  setTaskFloatCollapsed(false);
                  setTaskFloatDock(taskFloatSide, taskFloatPositionRef.current.y, false);
                  return;
                }
                toggleTaskMenu();
              }}
            >
              {taskFloatCollapsed ? (
                <Text style={styles.globalTaskCollapsedText}>
                  {taskFloatSide === "right" ? "‹" : "›"}
                </Text>
              ) : (
                <>
                  {taskStarted && <Animated.View style={[styles.globalTaskDot, recPulseStyle]} />}
                  <View style={styles.globalTaskTextBlock}>
                    <Text style={styles.globalTaskText}>
                      {taskMenuOpen ? "收起任务" : taskStarted ? "任务中" : "新任务"}
                    </Text>
                    {taskStarted && (
                      <Text style={styles.globalTaskSubText}>{taskDuration}</Text>
                    )}
                  </View>
                </>
              )}
            </Pressable>
          </View>

          <Animated.View
            pointerEvents={navTouchable ? "auto" : "none"}
            style={[styles.navBarWrap, navAnimatedStyle]}
          >
            <GlassView style={styles.navBar}>
              {[
                ["record", "记录"],
                ["timeline", "问题"],
                ["checkpoint", "考点"],
                ["data", "数据"],
                ["calculator", "计算"],
                ["settings", "设置"]
              ].map(([id, label]) => (
                <Pressable
                  key={id}
                  style={[styles.navItem, activeTab === id && styles.navItemActive]}
                  onPress={() => {
                    triggerHaptic();
                    setNavVisible(true);
                    scheduleNavHide();
                    setActiveTab(id);
                  }}
                >
                  <Text style={[styles.navText, activeTab === id && styles.navTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </GlassView>
          </Animated.View>
        </KeyboardAvoidingView>

        {startupVisible && (
          <Animated.View style={[styles.startupOverlay, startupOverlayStyle]}>
            <View style={styles.startupMark}>
              <View style={styles.startupMarkInner} />
            </View>
            <Text style={styles.startupTitle}>智驾指标记录</Text>
            <Text style={styles.startupSubtitle}>测试数据准备中</Text>
            <View style={styles.startupProgressTrack}>
              <View style={styles.startupProgressFill} />
            </View>
          </Animated.View>
        )}

        <Modal transparent visible={!!eventModalMetric} animationType="fade">
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setEventModalMetric(null)}
          >
            <Pressable onPress={(event) => event.stopPropagation()}>
            <GlassView style={styles.modalCard}>
              <Text style={styles.modalTitle}>{eventModalMetric?.name}</Text>
              <Text style={styles.modalSubtitle}>选择严重程度，也可以补充现场备注</Text>
              <View style={styles.severityRow}>
                {severityLevels.map((level) => (
                  <Pressable
                    key={level.id}
                    style={[
                      styles.severityButton,
                      eventSeverity === level.id && { backgroundColor: level.color }
                    ]}
                    onPress={() => setEventSeverity(level.id)}
                  >
                    <Text
                      style={[
                        styles.severityButtonText,
                        eventSeverity === level.id && styles.severityButtonTextActive
                      ]}
                    >
                      {level.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={eventNote}
                onChangeText={setEventNote}
                placeholder="备注，例如：雨天、前车急刹、路口名称"
                placeholderTextColor="#7c8790"
                style={[styles.input, styles.noteInput]}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalGhostButton}
                  onPress={() => setEventModalMetric(null)}
                >
                  <Text style={styles.modalGhostText}>取消</Text>
                </Pressable>
                <Pressable style={styles.modalPrimaryButton} onPress={submitEventWithDetail}>
                  <Text style={styles.modalPrimaryText}>记录 +1</Text>
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.modalDeleteButton,
                  pressed && styles.buttonPressed
                ]}
                onPress={() => eventModalMetric && deleteMetric(eventModalMetric)}
              >
                <Text style={styles.modalDeleteText}>删除指标</Text>
              </Pressable>
            </GlassView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal transparent visible={newSessionModalVisible} animationType="fade">
          <View style={styles.modalBackdrop}>
            <GlassView style={styles.modalCard}>
              <Text style={styles.modalTitle}>创建测试任务</Text>
              <Text style={styles.modalSubtitle}>
                {newSessionDraft.taskType === "checkpoint"
                  ? "考点记录模式只用于采点定位，不需要填写测试任务信息"
                  : "请填写本次测试的基础信息，创建后当前记录会清零"}
              </Text>
              <Text style={styles.problemLabel}>任务类型</Text>
              <View style={styles.problemResultRow}>
                {[
                  ["drive", "行车测试"],
                  ["checkpoint", "考点记录"]
                ].map(([type, label]) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.problemResultButton,
                      newSessionDraft.taskType === type && styles.problemResultButtonActive
                    ]}
                    onPress={() =>
                      setNewSessionDraft((current) => ({ ...current, taskType: type }))
                    }
                  >
                    <Text
                      style={[
                        styles.problemResultText,
                        newSessionDraft.taskType === type &&
                          styles.problemResultTextActive
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {newSessionDraft.taskType !== "checkpoint" && (
                <>
                  <TextInput
                    value={newSessionDraft.name}
                    onChangeText={(value) =>
                      setNewSessionDraft((current) => ({ ...current, name: value }))
                    }
                    placeholder="任务名称（必填）"
                    placeholderTextColor="#7c8790"
                    style={styles.input}
                  />
                  <TextInput
                    value={newSessionDraft.route}
                    onChangeText={(value) =>
                      setNewSessionDraft((current) => ({ ...current, route: value }))
                    }
                    placeholder="测试路线（必填）"
                    placeholderTextColor="#7c8790"
                    style={styles.input}
                  />
                  <TextInput
                    value={newSessionDraft.vehicle}
                    onChangeText={(value) =>
                      setNewSessionDraft((current) => ({ ...current, vehicle: value }))
                    }
                    placeholder="车辆编号（必填）"
                    placeholderTextColor="#7c8790"
                    style={styles.input}
                  />
                  <TextInput
                    value={newSessionDraft.version}
                    onChangeText={(value) =>
                      setNewSessionDraft((current) => ({ ...current, version: value }))
                    }
                    placeholder="软件版本（必填）"
                    placeholderTextColor="#7c8790"
                    style={styles.input}
                  />
                  <TextInput
                    value={newSessionDraft.staff}
                    onChangeText={(value) =>
                      setNewSessionDraft((current) => ({ ...current, staff: value }))
                    }
                    placeholder="记录人/安全员（必填）"
                    placeholderTextColor="#7c8790"
                    style={styles.input}
                  />
                </>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalGhostButton}
                  onPress={() => setNewSessionModalVisible(false)}
                >
                  <Text style={styles.modalGhostText}>取消</Text>
                </Pressable>
                <Pressable style={styles.modalPrimaryButton} onPress={confirmStartNewSession}>
                  <Text style={styles.modalPrimaryText}>创建任务</Text>
                </Pressable>
              </View>
            </GlassView>
          </View>
        </Modal>

        <Modal transparent visible={!!pendingCheckpoint} animationType="fade">
          <View style={styles.modalBackdrop}>
            <GlassView style={styles.modalCard}>
              <Text style={styles.modalTitle}>已过考点：{pendingCheckpoint?.name}</Text>
              <Text style={styles.modalSubtitle}>
                请快速记录该考点表现，距离约 {Math.round(pendingCheckpoint?.distance ?? 0)}m
              </Text>
              <View style={styles.checkpointChoiceGrid}>
                {checkpointPerformanceOptions.map(({ id, label }) => (
                  <Pressable
                    key={id}
                    style={[
                      styles.checkpointChoiceButton,
                      checkpointPerformance === id && styles.checkpointChoiceButtonActive
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setCheckpointPerformance(id);
                    }}
                  >
                    <Text
                      style={[
                        styles.checkpointChoiceText,
                        checkpointPerformance === id && styles.checkpointChoiceTextActive
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={checkpointNote}
                onChangeText={setCheckpointNote}
                placeholder="表现备注，可不填"
                placeholderTextColor="#7c8790"
                style={[styles.input, styles.noteInput]}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalGhostButton} onPress={skipCheckpointPerformance}>
                  <Text style={styles.modalGhostText}>稍后补</Text>
                </Pressable>
                <Pressable
                  style={styles.modalPrimaryButton}
                  onPress={() => saveCheckpointPerformance()}
                >
                  <Text style={styles.modalPrimaryText}>保存表现</Text>
                </Pressable>
              </View>
            </GlassView>
          </View>
        </Modal>

        <Modal transparent visible={!!dialog} animationType="fade">
          <View style={styles.modalBackdrop}>
            <GlassView style={styles.dialogCard}>
              <View style={styles.dialogAccent} />
              <Text style={styles.dialogTitle}>{dialog?.title}</Text>
              <Text style={styles.dialogMessage}>{dialog?.message}</Text>
              <View style={styles.dialogActions}>
                {(dialog?.actions ?? []).map((action, index) => (
                  <Pressable
                    key={`${action.text}-${index}`}
                    style={({ pressed }) => [
                      styles.dialogButton,
                      action.variant === "ghost" && styles.dialogGhostButton,
                      action.variant === "danger" && styles.dialogDangerButton,
                      pressed && styles.buttonPressed
                    ]}
                    onPress={() => runDialogAction(action)}
                  >
                    <Text
                      style={[
                        styles.dialogButtonText,
                        action.variant === "ghost" && styles.dialogGhostText,
                        action.variant === "danger" && styles.dialogDangerText
                      ]}
                    >
                      {action.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </GlassView>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  backgroundTop: {
    backgroundColor: "#dce8ff",
    height: 260,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  backgroundBottom: {
    backgroundColor: "#eef7f2",
    bottom: 0,
    height: 420,
    left: 0,
    position: "absolute",
    right: 0
  },
  screen: {
    flex: 1
  },
  startupOverlay: {
    alignItems: "center",
    backgroundColor: "#f5f7fb",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 36,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 50
  },
  startupMark: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 18,
    height: 78,
    justifyContent: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    width: 78
  },
  startupMarkInner: {
    backgroundColor: "#26d07c",
    borderRadius: 8,
    height: 32,
    width: 32
  },
  startupTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 22
  },
  startupSubtitle: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8
  },
  startupProgressTrack: {
    backgroundColor: "rgba(102,112,133,0.16)",
    borderRadius: 999,
    height: 5,
    marginTop: 24,
    overflow: "hidden",
    width: 132
  },
  startupProgressFill: {
    backgroundColor: "#0f766e",
    borderRadius: 999,
    height: 5,
    width: "72%"
  },
  scrollContent: {
    alignSelf: "center",
    width: "100%",
    paddingBottom: 162,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  scrollContentTablet: {
    maxWidth: 980,
    paddingHorizontal: 24
  },
  glass: {
    backgroundColor: "rgba(255,255,255,0.64)",
    borderColor: "rgba(255,255,255,0.86)",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 5,
    overflow: "hidden",
    shadowColor: "#243042",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20
  },
  pinnedStatusWrap: {
    paddingHorizontal: 18,
    paddingTop: 10,
    zIndex: 10
  },
  taskStatusBar: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  taskStatusBarCollapsed: {
    paddingVertical: 6
  },
  taskStatusIdle: {
    backgroundColor: "#fff7d6",
    borderColor: "#facc15",
    borderWidth: 1
  },
  taskStatusActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
    borderWidth: 1,
    elevation: 3,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12
  },
  taskStatusText: {
    fontSize: 14,
    fontWeight: "900"
  },
  taskStatusMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  taskStatusMainCollapsed: {
    minHeight: 28
  },
  taskStatusLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0
  },
  taskStatusTextBlock: {
    flex: 1,
    minWidth: 0
  },
  taskStatusDetailClip: {
    overflow: "hidden"
  },
  taskStatusRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  recDot: {
    backgroundColor: "#ffffff",
    borderRadius: 5,
    height: 10,
    width: 10
  },
  timerPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  timerPillCollapsed: {
    minWidth: 78,
    paddingVertical: 3
  },
  timerPillLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 9,
    fontWeight: "900"
  },
  timerPillText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1
  },
  taskStatusSubText: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  taskStatusTextIdle: {
    color: "#854d0e"
  },
  taskStatusTextActive: {
    color: "#ffffff"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 14
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "900"
  },
  subtitle: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5
  },
  headerStats: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 8
  },
  statBlock: {
    alignItems: "center",
    minWidth: 45
  },
  statValue: {
    color: "#1d4ed8",
    fontSize: 16,
    fontWeight: "900"
  },
  statLabel: {
    color: "#667085",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2
  },
  statDivider: {
    backgroundColor: "rgba(102,112,133,0.24)",
    height: 28,
    marginHorizontal: 8,
    width: 1
  },
  editor: {
    gap: 10,
    marginBottom: 12,
    padding: 12
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderColor: "rgba(102,112,133,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 13
  },
  groupChips: {
    gap: 8,
    paddingRight: 8
  },
  groupChip: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12
  },
  groupChipText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "800"
  },
  groupChipTextActive: {
    color: "#ffffff"
  },
  addButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  toolbar: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    padding: 8
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  toolButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  warnButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderColor: "rgba(239,100,8,0.5)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  warnButtonText: {
    color: "#c2410c",
    fontSize: 13,
    fontWeight: "900"
  },
  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }]
  },
  buttonDisabled: {
    opacity: 0.62
  },
  metricSection: {
    marginBottom: 18
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
    paddingHorizontal: 3
  },
  sectionTitle: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "900"
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: "900"
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metricCard: {
    borderRadius: 8,
    elevation: 3,
    height: 76,
    justifyContent: "space-between",
    padding: 8,
    shadowColor: "#1f2937",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    width: "48.65%"
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.965 }]
  },
  metricCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 4
  },
  metricGlyph: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 17
  },
  metricName: {
    color: "#ffffff",
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  countBadge: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.24)",
    borderRadius: 8,
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  countBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  settingsHeader: {
    marginBottom: 12,
    padding: 14
  },
  formCard: {
    gap: 10,
    marginBottom: 12,
    padding: 14
  },
  settingCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 14
  },
  settingText: {
    flex: 1,
    minWidth: 0
  },
  settingTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  settingDesc: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  settingButton: {
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  settingButtonSmall: {
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 14
  },
  settingButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  settingDangerButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(239,100,8,0.5)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 14
  },
  settingDangerText: {
    color: "#c2410c",
    fontSize: 13,
    fontWeight: "900"
  },
  eventItem: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    padding: 12
  },
  eventColor: {
    borderRadius: 4,
    width: 5
  },
  eventBody: {
    flex: 1,
    minWidth: 0
  },
  eventTopLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  eventTitle: {
    color: "#111827",
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  },
  eventMeta: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4
  },
  eventNote: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  problemEditor: {
    gap: 10,
    marginBottom: 12,
    padding: 12
  },
  problemLabel: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "900"
  },
  problemInput: {
    minHeight: 112,
    paddingTop: 12
  },
  problemMatchBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  problemResultRow: {
    flexDirection: "row",
    gap: 8
  },
  problemResultButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 38
  },
  problemResultButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827"
  },
  problemResultText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "900"
  },
  problemResultTextActive: {
    color: "#ffffff"
  },
  problemMatchText: {
    color: "#667085",
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  problemClearButton: {
    backgroundColor: "rgba(255,255,255,0.74)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  problemClearText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "900"
  },
  problemTagPanel: {
    marginBottom: 12,
    padding: 12
  },
  problemPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },
  problemPanelTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  problemPanelHint: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700"
  },
  problemTagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  problemTag: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 11
  },
  problemTagMatched: {
    backgroundColor: "rgba(15,118,110,0.1)",
    borderColor: "rgba(15,118,110,0.32)"
  },
  problemTagText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
    maxWidth: 150
  },
  problemTagTextActive: {
    color: "#ffffff"
  },
  problemTagScore: {
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "900"
  },
  problemCustomCard: {
    gap: 10,
    marginBottom: 12,
    padding: 12
  },
  problemCustomRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  problemCustomInput: {
    flex: 1
  },
  problemAddButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 15
  },
  problemAddText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  problemSubmitButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    justifyContent: "center",
    marginBottom: 12,
    minHeight: 48
  },
  problemSubmitText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  problemRecentCard: {
    gap: 10,
    padding: 12
  },
  problemRecentItem: {
    backgroundColor: "rgba(255,255,255,0.5)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  locationWarmupCard: {
    backgroundColor: "rgba(15,23,42,0.04)",
    borderColor: "rgba(15,23,42,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
    padding: 10
  },
  locationWarmupTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  locationWarmupTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  locationWarmupDesc: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  locationQualityBadge: {
    backgroundColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    color: "#475467",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  locationQualityReady: {
    backgroundColor: "rgba(34,197,94,0.14)",
    color: "#15803d"
  },
  locationQualityWarning: {
    backgroundColor: "rgba(245,158,11,0.16)",
    color: "#b45309"
  },
  locationQualityFailed: {
    backgroundColor: "rgba(239,68,68,0.14)",
    color: "#b91c1c"
  },
  locationDebugText: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  },
  locationActionRow: {
    flexDirection: "row",
    gap: 8
  },
  locationMiniButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderColor: "rgba(102,112,133,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 36
  },
  locationMiniButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900"
  },
  checkpointStatusCard: {
    gap: 10,
    marginBottom: 12,
    padding: 14
  },
  checkpointStatusTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  checkpointStageHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  checkpointStageBadge: {
    backgroundColor: "rgba(15,118,110,0.12)",
    borderRadius: 8,
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  checkpointCoordinateText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "800"
  },
  checkpointOrderBox: {
    backgroundColor: "rgba(15,118,110,0.08)",
    borderColor: "rgba(15,118,110,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  checkpointOrderTitle: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  checkpointOrderText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900"
  },
  checkpointItem: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  checkpointIndex: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  checkpointIndexText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  checkpointChoiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  checkpointChoiceButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.76)",
    borderColor: "rgba(102,112,133,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    width: "48%"
  },
  checkpointChoiceButtonActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e"
  },
  checkpointChoiceText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "900"
  },
  checkpointChoiceTextActive: {
    color: "#ffffff"
  },
  checkpointCloudActions: {
    flexDirection: "row",
    gap: 8
  },
  checkpointCloudButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  checkpointCloudButtonGhost: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(102,112,133,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  checkpointCloudButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  checkpointCloudButtonGhostText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  checkpointCloudList: {
    gap: 8
  },
  checkpointCloudItem: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10
  },
  problemMetricRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  calculatorCard: {
    gap: 12,
    marginBottom: 12,
    padding: 12
  },
  calculatorHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  calculatorList: {
    gap: 8
  },
  calculatorRow: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  calculatorRowInvalid: {
    backgroundColor: "rgba(254,242,242,0.86)",
    borderColor: "rgba(239,68,68,0.42)"
  },
  calculatorTitleBlock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  calculatorMetricName: {
    color: "#111827",
    flex: 1,
    fontSize: 14,
    fontWeight: "900"
  },
  calculatorMetricUnit: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900"
  },
  calculatorInputs: {
    flexDirection: "row",
    gap: 8
  },
  calculatorInput: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    flex: 1,
    fontSize: 13,
    minHeight: 38,
    paddingHorizontal: 10
  },
  calculatorWideInput: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderColor: "rgba(102,112,133,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    flex: 1,
    fontSize: 13,
    minHeight: 38,
    paddingHorizontal: 10
  },
  calculatorResult: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 34
  },
  calculatorResultComplete: {
    backgroundColor: "rgba(15,118,110,0.1)"
  },
  calculatorResultPending: {
    backgroundColor: "rgba(102,112,133,0.1)"
  },
  calculatorResultEmpty: {
    backgroundColor: "rgba(148,163,184,0.1)"
  },
  calculatorResultInvalid: {
    backgroundColor: "rgba(239,68,68,0.14)"
  },
  calculatorResultText: {
    fontSize: 13,
    fontWeight: "900"
  },
  calculatorResultCompleteText: {
    color: "#0f766e"
  },
  calculatorResultPendingText: {
    color: "#667085"
  },
  calculatorResultEmptyText: {
    color: "#64748b"
  },
  calculatorResultInvalidText: {
    color: "#b91c1c"
  },
  calculatorFloatingExportWrap: {
    bottom: 76,
    left: 18,
    position: "absolute",
    right: 18,
    zIndex: 12
  },
  calculatorFloatingExportButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48
  },
  calculatorExportText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  globalTaskDock: {
    alignItems: "flex-end",
    position: "absolute",
    zIndex: 18
  },
  globalTaskButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    elevation: 6,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 92,
    paddingHorizontal: 14,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16
  },
  globalTaskButtonCollapsed: {
    borderRadius: 10,
    minWidth: TASK_FLOAT_WIDTH,
    paddingHorizontal: 0
  },
  globalTaskButtonActive: {
    backgroundColor: "#0f766e",
    shadowColor: "#0f766e"
  },
  globalTaskButtonOpen: {
    backgroundColor: "#1d4ed8",
    shadowColor: "#1d4ed8"
  },
  globalTaskButtonDragging: {
    opacity: 0.9,
    transform: [{ scale: 1.04 }]
  },
  globalTaskDot: {
    backgroundColor: "#ffffff",
    borderRadius: 4,
    height: 8,
    width: 8
  },
  globalTaskTextBlock: {
    alignItems: "flex-start"
  },
  globalTaskCollapsedText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
  },
  globalTaskText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  globalTaskSubText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2
  },
  severityText: {
    fontSize: 12,
    fontWeight: "900"
  },
  emptyCard: {
    padding: 18
  },
  emptyText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 20
  },
  reportCard: {
    marginBottom: 12,
    padding: 14
  },
  reportHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  reportTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  reportTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  reportTitle: {
    color: "#111827",
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  },
  expandHint: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900"
  },
  reportMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  statusBadge: {
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusSynced: {
    backgroundColor: "rgba(34,197,94,0.12)",
    color: "#15803d"
  },
  statusFailed: {
    backgroundColor: "rgba(239,68,68,0.12)",
    color: "#b91c1c"
  },
  statusLocal: {
    backgroundColor: "rgba(102,112,133,0.12)",
    color: "#475467"
  },
  reportMetricList: {
    gap: 8,
    marginTop: 12
  },
  reportDetailSectionTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  compactMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  compactMetricPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 8,
    width: "48%"
  },
  compactMetricDot: {
    borderRadius: 3,
    height: 16,
    width: 4
  },
  compactMetricName: {
    color: "#344054",
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  compactMetricCount: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  compactProblemSummary: {
    backgroundColor: "rgba(15,118,110,0.08)",
    borderColor: "rgba(15,118,110,0.14)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 9
  },
  compactProblemText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  compactProblemMore: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  reportCheckpointSection: {
    backgroundColor: "rgba(255,255,255,0.48)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  reportCheckpointHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  reportCheckpointItem: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.62)",
    borderColor: "rgba(102,112,133,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    padding: 8
  },
  reportCheckpointIndex: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  reportCheckpointIndexText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  reportCheckpointTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  reportCheckpointMeta: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3
  },
  reportCheckpointNote: {
    color: "#475467",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  },
  reportCheckpointBadge: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  reportError: {
    color: "#b91c1c",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8
  },
  reportActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  reportActionButton: {
    alignItems: "center",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12
  },
  reportActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  reportDeleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(239,68,68,0.45)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12
  },
  reportDeleteText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "900"
  },
  metricDetailCard: {
    backgroundColor: "rgba(255,255,255,0.54)",
    borderColor: "rgba(102,112,133,0.14)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 10
  },
  metricDetailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  metricDetailColor: {
    borderRadius: 4,
    height: 34,
    width: 5
  },
  metricDetailTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  metricDetailTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  metricDetailMeta: {
    color: "#667085",
    fontSize: 12,
    marginTop: 3
  },
  metricEmptyText: {
    color: "#98a2b3",
    fontSize: 12,
    marginTop: 9
  },
  taskMenu: {
    padding: 12,
    position: "absolute",
    zIndex: 17,
    width: 250
  },
  taskMenuTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900"
  },
  taskMenuDesc: {
    color: "#667085",
    fontSize: 12,
    marginTop: 4
  },
  taskMenuActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  taskMenuPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 38
  },
  taskMenuEndButton: {
    backgroundColor: "#b91c1c"
  },
  taskMenuPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  navBarWrap: {
    bottom: 12,
    left: 18,
    position: "absolute",
    right: 18,
    zIndex: 11
  },
  navBar: {
    flexDirection: "row",
    gap: 5,
    padding: 6
  },
  navItem: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 44
  },
  navItemActive: {
    backgroundColor: "#111827"
  },
  navText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "900"
  },
  navTextActive: {
    color: "#ffffff"
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17,24,39,0.38)",
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  modalCard: {
    gap: 10,
    maxWidth: 520,
    padding: 16,
    width: "100%"
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  modalSubtitle: {
    color: "#667085",
    fontSize: 12,
    marginTop: 5
  },
  severityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14
  },
  severityButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.76)",
    borderColor: "rgba(102,112,133,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 38
  },
  severityButtonText: {
    color: "#475467",
    fontSize: 13,
    fontWeight: "900"
  },
  severityButtonTextActive: {
    color: "#ffffff"
  },
  noteInput: {
    marginTop: 12,
    minHeight: 92,
    paddingTop: 10,
    textAlignVertical: "top"
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  modalGhostButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  modalGhostText: {
    color: "#475467",
    fontSize: 14,
    fontWeight: "900"
  },
  modalPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  modalPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  modalDeleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(254,242,242,0.9)",
    borderColor: "rgba(239,68,68,0.34)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 40
  },
  modalDeleteText: {
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "900"
  },
  dialogCard: {
    maxWidth: 520,
    padding: 18,
    width: "100%"
  },
  dialogAccent: {
    alignSelf: "flex-start",
    backgroundColor: "#1d4ed8",
    borderRadius: 3,
    height: 5,
    marginBottom: 12,
    width: 44
  },
  dialogTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "900"
  },
  dialogMessage: {
    color: "#475467",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 18
  },
  dialogButton: {
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: 14
  },
  dialogGhostButton: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(102,112,133,0.22)",
    borderWidth: 1
  },
  dialogDangerButton: {
    backgroundColor: "#dc2626"
  },
  dialogButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  dialogGhostText: {
    color: "#475467"
  },
  dialogDangerText: {
    color: "#ffffff"
  }
});
