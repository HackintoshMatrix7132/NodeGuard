function stripImageVersion(reference: string) {
  const withoutDigest = reference.split("@", 1)[0];
  const lastSlash = withoutDigest.lastIndexOf("/");
  const lastColon = withoutDigest.lastIndexOf(":");
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest;
}

function encodePath(parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

export function getContainerImageRepositoryUrl(reference: string) {
  const repository = stripImageVersion(reference.trim().toLowerCase());
  if (!repository || /\s/.test(repository)) return null;

  const parts = repository.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const registry = parts[0];
  if (registry === "ghcr.io") {
    const imagePath = parts.slice(1);
    if (imagePath.length < 2) return null;
    const owner = encodeURIComponent(imagePath[0]);
    const packageName = encodeURIComponent(imagePath.at(-1) ?? "");
    return `https://github.com/orgs/${owner}/packages/container/package/${packageName}`;
  }

  if (registry === "quay.io") {
    const imagePath = parts.slice(1);
    if (imagePath.length !== 2) return null;
    return `https://quay.io/repository/${encodePath(imagePath)}`;
  }

  const dockerRegistries = new Set(["docker.io", "index.docker.io", "registry-1.docker.io"]);
  const hasExplicitRegistry = registry.includes(".") || registry.includes(":") || registry === "localhost";
  if (hasExplicitRegistry && !dockerRegistries.has(registry)) return null;

  const imagePath = dockerRegistries.has(registry) ? parts.slice(1) : parts;
  if (imagePath.length === 1) {
    return `https://hub.docker.com/_/${encodeURIComponent(imagePath[0])}`;
  }
  if (imagePath.length === 2 && imagePath[0] === "library") {
    return `https://hub.docker.com/_/${encodeURIComponent(imagePath[1])}`;
  }
  if (imagePath.length === 2) {
    return `https://hub.docker.com/r/${encodePath(imagePath)}`;
  }

  return null;
}
