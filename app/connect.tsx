import { router } from "expo-router";
import { Eye, EyeOff, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { colors, radius, spacing } from "@/constants/theme";
import { useValidateConnection } from "@/hooks/useNodeGuardQueries";
import { useSettingsStore } from "@/store/settingsStore";

export default function ConnectScreen() {
  const [backendUrl, setBackendUrl] = useState("http://localhost:4000");
  const [apiKey, setApiKey] = useState("demo-nodeguard-key");
  const [focusedField, setFocusedField] = useState<"backendUrl" | "apiKey" | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const saveConnection = useSettingsStore((state) => state.saveConnection);
  const validateConnection = useValidateConnection();

  const onConnect = async () => {
    try {
      await validateConnection.mutateAsync({ backendUrl, apiKey });
      await saveConnection(backendUrl, apiKey);
      router.replace("/dashboard");
    } catch (error) {
      if (__DEV__) {
        console.warn("Connection validation failed", error);
      }
    }
  };

  const errorMessage = validateConnection.error instanceof Error ? validateConnection.error.message : null;

  return (
    <View style={styles.screen}>
      <OrbitBackground />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.logoHalo}>
                <View style={styles.logo}>
                  <ShieldCheck color={colors.background} size={36} strokeWidth={2.6} />
                </View>
              </View>
              <Text style={styles.brand}>Welcome to NodeGuard</Text>
              <Text style={styles.tagline}>Monitor your servers. Protect your stack.</Text>
            </View>

            <View style={styles.form}>
              {errorMessage ? (
                <View style={styles.errorBox}>
                  <TriangleAlert color={colors.critical} size={17} strokeWidth={2.3} />
                  <View style={styles.errorCopy}>
                    <Text style={styles.errorTitle}>Connection failed</Text>
                    <Text style={styles.error}>{errorMessage}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Backend URL</Text>
                <TextInput
                  value={backendUrl}
                  onChangeText={setBackendUrl}
                  onFocus={() => setFocusedField("backendUrl")}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://nodeguard.local"
                  placeholderTextColor={colors.textDim}
                  style={[styles.input, focusedField === "backendUrl" && styles.inputFocused]}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>API key</Text>
                <View style={[styles.passwordRow, focusedField === "apiKey" && styles.inputFocused]}>
                  <TextInput
                    value={apiKey}
                    onChangeText={setApiKey}
                    onFocus={() => setFocusedField("apiKey")}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showApiKey}
                    placeholder="Paste API key"
                    placeholderTextColor={colors.textDim}
                    style={styles.passwordInput}
                  />
                  <Pressable
                    accessibilityLabel={showApiKey ? "Hide API key" : "Show API key"}
                    hitSlop={10}
                    onPress={() => setShowApiKey((current) => !current)}
                    style={styles.eyeButton}
                  >
                    {showApiKey ? (
                      <EyeOff color={colors.textMuted} size={18} strokeWidth={2.2} />
                    ) : (
                      <Eye color={colors.textMuted} size={18} strokeWidth={2.2} />
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[styles.button, validateConnection.isPending && styles.buttonDisabled]}
                onPress={onConnect}
                disabled={validateConnection.isPending}
              >
                {validateConnection.isPending ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Connect</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setBackendUrl("http://localhost:4000");
                  setApiKey("demo-nodeguard-key");
                }}
              >
                <Text style={styles.helperLink}>Use demo credentials</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Documentation</Text>
            <Text style={styles.footerDivider}>|</Text>
            <Text style={styles.footerText}>Support</Text>
            <Text style={styles.footerDivider}>|</Text>
            <Text style={styles.footerText}>Open Source</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function OrbitBackground() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Rect width="390" height="844" fill={colors.background} />
      <Circle cx="-34" cy="174" r="196" fill="#10243f" opacity="0.52" />
      <Circle cx="424" cy="732" r="252" fill="#152a4d" opacity="0.46" />
      <Circle cx="330" cy="110" r="168" fill="#0a1c33" opacity="0.78" />
      <Path d="M-66 512C38 448 138 461 232 552c70 68 134 96 219 70" stroke="#3756a6" strokeWidth="3" opacity="0.52" fill="none" />
      <Path d="M-28 137c105 23 194 4 269-55 51-40 102-65 180-63" stroke="#3c5dac" strokeWidth="2.4" opacity="0.56" fill="none" />
      <Path d="M259 842c36-125 100-197 194-218 52-12 103-8 160 13" stroke="#3c5dac" strokeWidth="2.3" opacity="0.45" fill="none" />
      <Line x1="315" y1="286" x2="408" y2="178" stroke={colors.warning} strokeWidth="3.2" opacity="0.92" />
      <Circle cx="62" cy="560" r="20" fill={colors.warning} />
      <Circle cx="62" cy="560" r="20" fill={colors.critical} opacity="0.25" />
      <Circle cx="318" cy="318" r="54" fill="#102543" opacity="0.8" />
      <Circle cx="318" cy="318" r="35" fill="#081a2f" opacity="0.95" />
      <Circle cx="318" cy="318" r="55" stroke="#4260b2" strokeWidth="3" opacity="0.7" fill="none" />
      <Rect x="308" y="318" width="4" height="13" fill={colors.warning} />
      <Rect x="315" y="311" width="4" height="20" fill={colors.accent} />
      <Rect x="322" y="304" width="4" height="27" fill={colors.critical} />
      <Circle cx="63" cy="164" r="33" stroke="#4260b2" strokeWidth="3" opacity="0.72" fill="none" />
      <Rect x="59" y="164" width="8" height="8" fill={colors.warning} />
      <Rect x="67" y="156" width="8" height="8" fill={colors.accent} />
      <Circle cx="336" cy="494" r="3" fill="#3857aa" opacity="0.85" />
      <Circle cx="356" cy="501" r="3" fill="#3857aa" opacity="0.85" />
      <Circle cx="375" cy="498" r="3" fill="#3857aa" opacity="0.85" />
      <Circle cx="30" cy="762" r="2.2" fill="#4869be" opacity="0.8" />
      <Circle cx="36" cy="754" r="2.2" fill="#4869be" opacity="0.8" />
      <Circle cx="43" cy="746" r="2.2" fill="#4869be" opacity="0.8" />
      <Circle cx="289" cy="681" r="2.4" fill="#4869be" opacity="0.62" />
      <Circle cx="300" cy="703" r="2.4" fill="#4869be" opacity="0.62" />
      <Circle cx="277" cy="722" r="2.4" fill="#4869be" opacity="0.62" />
      <Rect x="354" y="594" width="7" height="7" fill={colors.accent} />
      <Rect x="361" y="601" width="7" height="7" fill={colors.accent} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboard: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: "100%",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    justifyContent: "center",
    gap: spacing.xl
  },
  card: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(122, 168, 255, 0.12)",
    backgroundColor: "rgba(13, 26, 38, 0.94)",
    boxShadow: "0px 18px 38px rgba(0, 0, 0, 0.34)",
    elevation: 8
  },
  header: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xxl
  },
  logoHalo: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    backgroundColor: "rgba(81, 214, 180, 0.12)"
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent
  },
  brand: {
    color: colors.text,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center"
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center"
  },
  form: {
    gap: spacing.md
  },
  field: {
    gap: spacing.xs
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800"
  },
  input: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#18283a",
    backgroundColor: "#080d13",
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    fontWeight: "700"
  },
  inputFocused: {
    borderColor: colors.blue,
    boxShadow: "0px 0px 0px 2px rgba(122, 168, 255, 0.34)"
  },
  passwordRow: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#18283a",
    backgroundColor: "#080d13",
    flexDirection: "row",
    alignItems: "center"
  },
  passwordInput: {
    flex: 1,
    minHeight: 40,
    color: colors.text,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    fontSize: 14,
    fontWeight: "700"
  },
  eyeButton: {
    width: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 122, 0.28)",
    backgroundColor: "rgba(74, 23, 32, 0.72)",
    padding: spacing.md
  },
  errorCopy: {
    flex: 1,
    gap: 2
  },
  errorTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900"
  },
  error: {
    color: "#ffc9cf",
    fontSize: 12,
    fontWeight: "700"
  },
  button: {
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blue,
    marginTop: spacing.xs
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "900"
  },
  helperLink: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right"
  },
  footer: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    opacity: 0.78
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  footerDivider: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700"
  }
});
