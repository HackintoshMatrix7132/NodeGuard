import { Redirect } from "expo-router";

import { useSettingsStore } from "@/store/settingsStore";

export default function Index() {
  const backendConfig = useSettingsStore((state) => state.backendConfig);

  return <Redirect href={backendConfig ? "/dashboard" : "/connect"} />;
}
