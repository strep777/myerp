import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw, RotateCcw, Save, Sparkles, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/use-api";
import type {
  AiProvider,
  AiSettings,
  AiSettingsUpdate,
  AiTestResult,
  OllamaModel,
  OllamaModelList,
} from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-lg border border-black/[0.09] bg-white px-3 text-[12px] shadow-[inset_0_1px_1px_rgba(15,23,42,0.02)] outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10";

export function SettingsPage() {
  useDocumentTitle("系统设置");
  const [form, setForm] = useState<AiSettingsUpdate | null>(null);
  const [template, setTemplate] = useState("");
  const [keyHint, setKeyHint] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [promptVersion, setPromptVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const loadOllamaModels = async (baseUrl?: string) => {
    const target = (baseUrl ?? form?.ollama_base_url ?? "").trim() || "http://127.0.0.1:11434";
    setModelsLoading(true);
    setModelsError("");
    try {
      const data = await api.get<OllamaModelList>("/ai/ollama/models", { base_url: target });
      setOllamaModels(data.models);
      if (!data.models.length) {
        setModelsError("Ollama 已连接，但还没有安装模型。请先在终端执行 ollama pull。");
      }
    } catch (error) {
      setOllamaModels([]);
      setModelsError(error instanceof ApiError ? error.message : "读取 Ollama 模型列表失败");
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get<AiSettings>("/ai/settings")
      .then((data) => {
        if (!active) return;
        setForm({
          provider: data.provider,
          deepseek_base_url: data.deepseek_base_url,
          deepseek_model: data.deepseek_model,
          ollama_base_url: data.ollama_base_url,
          ollama_model: data.ollama_model,
          default_prompt: data.default_prompt,
          auto_confirm: data.auto_confirm,
        });
        setTemplate(data.default_prompt_template);
        setKeyHint(data.deepseek_api_key_hint);
        setKeySet(data.deepseek_api_key_set);
        setUpdatedAt(data.updated_at);
        setPromptVersion(data.prompt_version);
        if (data.provider === "OLLAMA") {
          void loadOllamaModels(data.ollama_base_url);
        }
      })
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : "加载 AI 设置失败");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof AiSettingsUpdate>(key: K, value: AiSettingsUpdate[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setTestResult(null);
  };

  const save = async () => {
    if (!form) return;
    if (!form.default_prompt.trim()) {
      toast.error("默认提示词不能为空");
      return;
    }
    setSaving(true);
    try {
      const payload: AiSettingsUpdate = {
        ...form,
        deepseek_api_key: apiKey.trim() || undefined,
        clear_deepseek_api_key: clearKey,
      };
      const data = await api.put<AiSettings>("/ai/settings", payload);
      setKeyHint(data.deepseek_api_key_hint);
      setKeySet(data.deepseek_api_key_set);
      setUpdatedAt(data.updated_at);
      setApiKey("");
      setClearKey(false);
      toast.success("AI 设置已保存");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<AiTestResult>("/ai/settings/test", {
        provider: form.provider,
        deepseek_base_url: form.deepseek_base_url,
        deepseek_model: form.deepseek_model,
        deepseek_api_key: apiKey.trim() || undefined,
        ollama_base_url: form.ollama_base_url,
        ollama_model: form.ollama_model,
      });
      setTestResult(result);
      if (result.models?.length) {
        setOllamaModels(result.models.map((name) => ({ name })));
      }
      if (result.ok && result.model_available !== false) {
        toast.success(`连接成功 · ${result.latency_ms}ms`);
      } else if (result.ok) {
        toast.warning(result.message || "已连接，但当前模型不可用");
      } else {
        toast.error(result.message || "连接测试未通过");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "连接测试失败");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="系统设置" description="配置 AI 提供商、提示词与安全策略。" />
        <div className="app-card flex h-48 items-center justify-center text-[12px] text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在读取设置…
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div>
        <PageHeader title="系统设置" description="配置 AI 提供商、提示词与安全策略。" />
        <div className="app-card p-6 text-[12px] text-muted-foreground">无法加载设置，请刷新后重试。</div>
      </div>
    );
  }

  const isDeepSeek = form.provider === "DEEPSEEK";

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="配置 AI 提供商与默认提示词。API Key 加密存储，读取时只显示掩码。"
        actions={
          <Button onClick={() => void save()} loading={saving}>
            <Save className="h-4 w-4" />
            保存设置
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="app-card p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-primary">
                <Bot className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[13px] font-semibold">AI 提供商</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  默认使用 DeepSeek；也可以切换到本地 Ollama，数据不出本机。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                ["DEEPSEEK", "DeepSeek", "云端 · deepseek-flash"],
                ["OLLAMA", "Ollama", "本地 · 动态读取模型"],
              ] as const).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    update("provider", value as AiProvider);
                    if (value === "OLLAMA") void loadOllamaModels();
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition",
                    form.provider === value
                      ? "border-primary/40 bg-blue-50/60 ring-1 ring-primary/15"
                      : "border-black/[0.07] bg-white hover:bg-secondary/40",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    {form.provider === value ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">服务地址</span>
                <Input
                  value={isDeepSeek ? form.deepseek_base_url : form.ollama_base_url}
                  onChange={(event) => update(isDeepSeek ? "deepseek_base_url" : "ollama_base_url", event.target.value)}
                  className={inputClass}
                  placeholder={isDeepSeek ? "https://api.deepseek.com" : "http://127.0.0.1:11434"}
                />
              </label>
              <div className={cn("block", !isDeepSeek && "sm:col-span-2")}>
                <span className="field-label">模型名称</span>
                {isDeepSeek ? (
                  <Input
                    value={form.deepseek_model}
                    onChange={(event) => update("deepseek_model", event.target.value)}
                    className={inputClass}
                    placeholder="deepseek-flash"
                  />
                ) : (
                  <>
                    <div className="flex gap-2">
                      {ollamaModels.length ? (
                        <select
                          value={form.ollama_model}
                          onChange={(event) => update("ollama_model", event.target.value)}
                          className={cn(inputClass, "min-w-0 flex-1 appearance-none pr-8")}
                          aria-label="Ollama 模型"
                        >
                          {form.ollama_model &&
                          !ollamaModels.some((model) => model.name === form.ollama_model) ? (
                            <option value={form.ollama_model}>
                              {form.ollama_model}（未在列表）
                            </option>
                          ) : null}
                          {ollamaModels.map((model) => (
                            <option key={model.name} value={model.name}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={form.ollama_model}
                          onChange={(event) => update("ollama_model", event.target.value)}
                          className={inputClass}
                          placeholder="先获取模型，或手动输入"
                        />
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0"
                        loading={modelsLoading}
                        onClick={() => void loadOllamaModels()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        获取模型
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                      {modelsError ? (
                        <span className="text-rose-600">{modelsError}</span>
                      ) : ollamaModels.length ? (
                        <>
                          已从 Ollama 读取 {ollamaModels.length} 个模型
                          {form.ollama_model &&
                          !ollamaModels.some((model) => model.name === form.ollama_model) ? (
                            <span className="text-amber-700">
                              ；当前模型不在列表中，请重新选择。
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "从 Ollama /api/tags 读取本机实际安装的模型。"
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>

            {isDeepSeek ? (
              <div className="mt-3">
                <span className="field-label">DeepSeek API Key</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setClearKey(false);
                        setTestResult(null);
                      }}
                      className={cn(inputClass, "pr-9")}
                      placeholder={keySet ? `已保存 ${keyHint}，留空表示不修改` : "sk-..."}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {keySet ? (
                    <Button
                      type="button"
                      variant={clearKey ? "destructive" : "secondary"}
                      onClick={() => {
                        setClearKey((value) => !value);
                        setApiKey("");
                      }}
                      className="shrink-0"
                    >
                      {clearKey ? "将清除" : "清除密钥"}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  密钥使用服务端密钥派生加密，仅在调用 AI 时解密，不会返回给浏览器。{clearKey ? " 保存后将删除现有密钥。" : ""}
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-[10px] leading-5 text-muted-foreground">
                请先在本机运行 Ollama。模型列表直接从服务端读取，不再写死；如列表为空，请先在终端执行{" "}
                <code className="font-mono">ollama pull &lt;模型名&gt;</code>。服务地址默认指向本机 11434 端口。
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => void test()} loading={testing}>
                <TestTube2 className="h-3.5 w-3.5" />
                测试连接
              </Button>
              {testResult ? (
                <span
                  className={cn(
                    "text-[11px]",
                    testResult.ok && testResult.model_available !== false
                      ? "text-emerald-700"
                      : testResult.ok
                        ? "text-amber-700"
                        : "text-rose-700",
                  )}
                >
                  {testResult.ok && testResult.model_available !== false
                    ? "连接正常"
                    : testResult.message || "连接失败"}
                  {testResult.latency_ms ? ` · ${testResult.latency_ms}ms` : ""}
                </span>
              ) : null}
            </div>
          </section>

          <section className="app-card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold">默认提示词</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  以 Skill 结构约束 AI 的输出与行为。修改后只影响下一次分析。
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update("default_prompt", template)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认
              </Button>
            </div>
            <textarea
              value={form.default_prompt}
              onChange={(event) => update("default_prompt", event.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-black/[0.09] bg-[#fbfbfd] p-3 font-mono text-[11px] leading-[1.7] text-slate-700 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              {form.default_prompt.length.toLocaleString()} 字符 · 提示词版本在服务端统一维护，避免前后端漂移。
            </p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="app-card p-5">
            <h2 className="text-[13px] font-semibold">入库策略</h2>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              控制 AI 预览确认后的默认行为。无论是否自动确认，服务端都会重新校验商品、仓库和数量。
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-black/[0.06] bg-secondary/30 p-3">
              <input
                type="checkbox"
                checked={form.auto_confirm}
                onChange={(event) => update("auto_confirm", event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-[#007AFF]"
              />
              <span>
                <span className="block text-[12px] font-medium">确认后立即执行入库</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                  开启后，AI 预览页点击“确认入库”会直接确认单据并改变库存；关闭后只生成草稿。
                </span>
              </span>
            </label>
          </section>

          <section className="app-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-[13px] font-semibold">使用建议</h2>
            </div>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">
              <li>· 截图尽量包含商品名称、规格、数量和实付金额。</li>
              <li>· 商品链接会由服务端抓取标题与描述，自动过滤内网地址。</li>
              <li>· 首次建议关闭自动确认，核对 AI 提取结果后再正式入库。</li>
              <li>· DeepSeek 需要联网并消耗额度；Ollama 完全本地运行。</li>
            </ul>
            <div className="mt-4 rounded-lg bg-secondary/50 px-3 py-2 text-[10px] text-muted-foreground">
              <p>提示词版本：{promptVersion || "—"}</p>
              {updatedAt ? <p className="mt-1">上次更新：{new Date(updatedAt).toLocaleString("zh-CN")}</p> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
