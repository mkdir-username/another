import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ChevronDownIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Settings, QuickActionId } from "../types";
import { PRESETS, RESOLUTION_OPTIONS, CODEC_OPTIONS, QUICK_ACTIONS } from "../types";
import type { GestureSettings } from "../hooks/useGestureSettings";

const APP_VERSION = "0.3.0";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  activePreset: string;
  pinnedActions: QuickActionId[];
  onApplyPreset: (name: string) => void;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onPinnedActionsChange: (actions: QuickActionId[]) => void;
  gestureSettings: GestureSettings;
  onUpdateGestureSetting: <K extends keyof GestureSettings>(key: K, value: GestureSettings[K]) => void;
}

function SectionHeader({ children, open }: { children: React.ReactNode; open?: boolean }) {
  return (
    <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-3 border-b border-border/60 cursor-pointer hover:bg-surface-hover/50 transition-colors">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-3">{children}</span>
      <ChevronDownIcon className={cn("size-3 text-text-3 transition-transform duration-200", open && "rotate-180")} />
    </CollapsibleTrigger>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  activePreset,
  pinnedActions,
  onApplyPreset,
  onUpdateSetting,
  onPinnedActionsChange,
  gestureSettings,
  onUpdateGestureSetting,
}: SettingsDialogProps) {
  const [videoOpen, setVideoOpen] = useState(true);
  const [gesturesOpen, setGesturesOpen] = useState(true);
  const [audioOpen, setAudioOpen] = useState(true);
  const [storageOpen, setStorageOpen] = useState(true);
  const [savePath, setSavePath] = useState(() => localStorage.getItem("save_path") || "");
  const [toolbarOpen, setToolbarOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          className="fixed left-0 right-0 bottom-0 max-h-[92vh] bg-surface border-t border-border rounded-t-2xl flex flex-col overflow-y-auto z-51 animate-in slide-in-from-bottom duration-250 no-scrollbar"
        >
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <DialogTitle className="text-[15px] font-bold text-foreground">Settings</DialogTitle>
          </div>

          <div className="px-5 py-4 border-b border-border/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-3 mb-3.5">Presets</div>
            <div className="flex gap-1.5">
              {Object.keys(PRESETS).map((name) => (
                <Button
                  key={name}
                  variant={activePreset === name ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-[11px]"
                  onClick={() => onApplyPreset(name)}
                >
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <Collapsible open={videoOpen} onOpenChange={setVideoOpen}>
            <SectionHeader open={videoOpen}>Video</SectionHeader>
            <CollapsibleContent>
              <div className="px-5 py-4 border-b border-border/60">
                <div style={{ opacity: settings.adaptive ? 0.5 : 1, pointerEvents: settings.adaptive ? 'none' : 'auto' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-foreground">Resolution</span>
                    <Select value={settings.max_size} onValueChange={(val) => onUpdateSetting("max_size", val as number)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>{RESOLUTION_OPTIONS.find((o) => o.value === settings.max_size)?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {RESOLUTION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-medium text-foreground">Max FPS</span>
                    <span className="text-xs font-medium font-mono text-text-2 min-w-[50px] text-right">{settings.max_fps}</span>
                  </div>
                  <Slider
                    className="mb-1"
                    value={settings.max_fps}
                    onValueChange={(val) => onUpdateSetting("max_fps", val as number)}
                    min={15} max={120} step={5}
                  />

                  <div className="flex items-center justify-between mb-3 mt-3">
                    <span className="text-[13px] font-medium text-foreground">Bitrate</span>
                    <span className="text-xs font-medium font-mono text-text-2 min-w-[50px] text-right">{(settings.video_bit_rate / 1000000).toFixed(0)} Mbps</span>
                  </div>
                  <Slider
                    className="mb-1"
                    value={settings.video_bit_rate}
                    onValueChange={(val) => onUpdateSetting("video_bit_rate", val as number)}
                    min={1000000} max={32000000} step={1000000}
                  />
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[13px] font-medium text-foreground">Codec</span>
                  <Select value={settings.video_codec} onValueChange={(val) => onUpdateSetting("video_codec", val as string)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue>{CODEC_OPTIONS.find((o) => o.value === settings.video_codec)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CODEC_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span className="text-[13px] font-medium text-foreground">Adaptive Quality</span>
                  <Switch
                    checked={settings.adaptive}
                    onCheckedChange={(checked) => onUpdateSetting("adaptive", checked)}
                  />
                </div>
                <div className="text-[11px] text-text-3 mt-1">Automatically adjusts quality based on network conditions</div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={gesturesOpen} onOpenChange={setGesturesOpen}>
            <SectionHeader open={gesturesOpen}>Gestures</SectionHeader>
            <CollapsibleContent>
              <div className="px-5 py-4 border-b border-border/60">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-foreground">Swipe strength</span>
                  <span className="text-xs font-medium font-mono text-text-2 min-w-[50px] text-right">×{gestureSettings.swipeGain.toFixed(1)}</span>
                </div>
                <Slider
                  className="mb-4"
                  value={gestureSettings.swipeGain}
                  onValueChange={(val) => onUpdateGestureSetting("swipeGain", val as number)}
                  min={1} max={5} step={0.5}
                />

                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-foreground">Invert scroll direction</span>
                  <Switch
                    checked={gestureSettings.invertScroll}
                    onCheckedChange={(checked) => onUpdateGestureSetting("invertScroll", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">Edge swipe goes back</span>
                  <Switch
                    checked={gestureSettings.edgeBack}
                    onCheckedChange={(checked) => onUpdateGestureSetting("edgeBack", checked)}
                  />
                </div>
                <div className="text-[11px] text-text-3 mt-2">Swipe inward from the left or right edge to go back</div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={audioOpen} onOpenChange={setAudioOpen}>
            <SectionHeader open={audioOpen}>Audio</SectionHeader>
            <CollapsibleContent>
              <div className="px-5 py-4 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">Forward device audio</span>
                  <Switch
                    checked={settings.audio}
                    onCheckedChange={(checked) => onUpdateSetting("audio", checked)}
                  />
                </div>
                <div className="text-[11px] text-text-3 mt-2">Requires Android 11+</div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={storageOpen} onOpenChange={setStorageOpen}>
            <SectionHeader open={storageOpen}>Storage</SectionHeader>
            <CollapsibleContent>
              <div className="px-5 py-4 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">Save location</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] gap-1.5 [&_svg]:size-3.5"
                    onClick={async () => {
                      const dir = await openDialog({ directory: true, multiple: false });
                      if (dir) {
                        setSavePath(dir);
                        localStorage.setItem("save_path", dir);
                      }
                    }}
                  >
                    <FolderOpenIcon />
                    Browse
                  </Button>
                </div>
                {savePath ? (
                  <div className="flex items-center justify-between mt-2.5">
                    <code className="text-[11px] font-mono text-text-2 truncate flex-1 mr-2">{savePath}</code>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-[10px] text-text-3 shrink-0"
                      onClick={() => {
                        setSavePath("");
                        localStorage.removeItem("save_path");
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                ) : (
                  <div className="text-[11px] text-text-3 mt-2">Screenshots and recordings will use browser downloads</div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={toolbarOpen} onOpenChange={setToolbarOpen}>
            <SectionHeader open={toolbarOpen}>Toolbar</SectionHeader>
            <CollapsibleContent>
              <div className="px-5 py-4 border-b border-border/60">
                <div className="text-[11px] text-text-3 mb-3">Toggle quick-action buttons on the toolbar</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((action) => {
                    const active = pinnedActions.includes(action.id);
                    return (
                      <Button
                        key={action.id}
                        variant={active ? "default" : "outline"}
                        size="sm"
                        className="text-[11px]"
                        onClick={() => {
                          const next = active
                            ? pinnedActions.filter((a) => a !== action.id)
                            : [...pinnedActions, action.id];
                          onPinnedActionsChange(next);
                          localStorage.setItem("pinned_actions", JSON.stringify(next));
                        }}
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="px-5 py-4 text-[11px] text-text-3 flex items-center justify-between">
            <span>Another v{APP_VERSION}</span>
            <span>Changes apply live</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
