import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  LATEX_GROUPS,
  PLAIN_GROUPS,
  applyBackspace,
  applyInsert,
  changePoint,
  nextStop,
  shiftStops,
  type EditResult,
  type KeySpec,
  type Selection,
} from './mathKeypadCore';

/**
 * 문제 출제용 수식 입력 키보드.
 *
 * 설계 요점
 * - MathInput이 <MathKeypadProvider> 아래에 등록되고, <MathKeypadBar />가 그중 "활성 필드"에
 *   커서 위치 그대로 삽입한다. 입력창을 흔들지 않으려고 키 버튼은 mousedown 기본동작을 막는다.
 * - 모바일에서는 키보드 바가 `visualViewport`만큼 위로 올라가서 **네이티브 키보드 바로 위**에 붙는다
 *   (iOS는 키보드가 열려도 `innerHeight`가 안 줄어들어서 position: fixed만으로는 키보드에 가린다).
 * - 정답 필드는 LaTeX가 아니라 ASCII 수식을 넣는다(채점기가 `evaluateExpression`으로 비교).
 */

export type MathFieldMode = 'latex' | 'plain';

interface FieldHandle {
  id: string;
  label: string;
  mode: MathFieldMode;
  maxLength?: number;
  el: () => HTMLInputElement | HTMLTextAreaElement | null;
  getValue: () => string;
  setValue: (value: string) => void;
}

interface FieldMeta {
  id: string;
  label: string;
  mode: MathFieldMode;
}

interface KeypadApi {
  fields: FieldMeta[];
  activeId: string | null;
  activeLabel: string;
  activeMode: MathFieldMode;
  /** 값은 스냅샷이 아니라 조회 시점에 읽는다(입력할 때마다 최신이어야 미리보기가 맞는다) */
  activeValue: () => string;
  notice: string;
  isTouch: boolean;
  nativeOffFor: (id: string, mode: MathFieldMode) => boolean;
  activate: (id: string, focus?: boolean) => void;
  reportSelection: (id: string, start: number, end: number) => void;
  noteEdit: (id: string, before: string, after: string) => void;
  insertKey: (spec: KeySpec) => void;
  backspace: () => void;
  clearField: () => void;
  undo: () => void;
  jumpNext: () => void;
  toggleNative: () => void;
}

const IS_TOUCH = typeof window !== 'undefined'
  && ((typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in window);

const RegistryContext = createContext<((field: FieldHandle) => () => void) | null>(null);
const KeypadContext = createContext<KeypadApi | null>(null);

export const useMathKeypad = (): KeypadApi | null => useContext(KeypadContext);

const HISTORY_LIMIT = 30;

export const MathKeypadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handles = useRef(new Map<string, FieldHandle>());
  const order = useRef<string[]>([]);
  const selections = useRef(new Map<string, Selection>());
  const stops = useRef(new Map<string, number[]>());
  const history = useRef(new Map<string, { value: string; caret: number }[]>());
  const noticeTimer = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [nativeOffMap, setNativeOffMap] = useState<Record<string, boolean>>({});

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const register = useCallback((field: FieldHandle) => {
    handles.current.set(field.id, field);
    if (!order.current.includes(field.id)) order.current.push(field.id);
    setFields((prev) => {
      const found = prev.find((f) => f.id === field.id);
      if (!found) return [...prev, { id: field.id, label: field.label, mode: field.mode }];
      if (found.label === field.label && found.mode === field.mode) return prev;
      return prev.map((f) => (f.id === field.id ? { id: field.id, label: field.label, mode: field.mode } : f));
    });
    if (!activeIdRef.current) {
      activeIdRef.current = field.id;
      setActiveId(field.id);
    }
    return () => {
      handles.current.delete(field.id);
      order.current = order.current.filter((id) => id !== field.id);
      selections.current.delete(field.id);
      stops.current.delete(field.id);
      history.current.delete(field.id);
      setFields((prev) => (prev.some((f) => f.id === field.id) ? prev.filter((f) => f.id !== field.id) : prev));
      if (activeIdRef.current === field.id) {
        const fallback = order.current[0] ?? null;
        activeIdRef.current = fallback;
        setActiveId(fallback);
      }
    };
  }, []);

  const registry = useMemo(() => ({ register }), [register]);

  const getActive = useCallback((): FieldHandle | null => {
    const id = activeIdRef.current ?? order.current[0];
    return id ? handles.current.get(id) ?? null : null;
  }, []);

  const placeCaret = useCallback((field: FieldHandle, caret: number, expected: string) => {
    const attempt = (tries: number) => {
      const el = field.el();
      if (!el) return;
      // React가 새 값을 DOM에 반영한 다음에 선택 영역을 맞춘다.
      if (el.value !== expected && tries < 40) {
        window.requestAnimationFrame(() => attempt(tries + 1));
        return;
      }
      const pos = Math.max(0, Math.min(caret, el.value.length));
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* selectionStart를 지원하지 않는 입력 타입 */
      }
      selections.current.set(field.id, { start: pos, end: pos });
    };
    attempt(0);
  }, []);

  const currentSelection = useCallback((field: FieldHandle, value: string): Selection => {
    const el = field.el();
    const clamp = (n: number) => Math.max(0, Math.min(n, value.length));
    if (el && document.activeElement === el && typeof el.selectionStart === 'number') {
      return { start: clamp(el.selectionStart ?? value.length), end: clamp(el.selectionEnd ?? value.length) };
    }
    const saved = selections.current.get(field.id);
    if (!saved) return { start: value.length, end: value.length };
    return { start: clamp(saved.start), end: clamp(saved.end) };
  }, []);

  const commit = useCallback((field: FieldHandle, before: string, result: EditResult) => {
    const stack = history.current.get(field.id) ?? [];
    stack.push({ value: before, caret: selections.current.get(field.id)?.start ?? before.length });
    if (stack.length > HISTORY_LIMIT) stack.shift();
    history.current.set(field.id, stack);
    stops.current.set(field.id, result.stops);
    field.setValue(result.value);
    const el = field.el();
    if (el && document.activeElement !== el) {
      try {
        el.focus({ preventScroll: false });
      } catch {
        /* focus 불가 환경 */
      }
    }
    placeCaret(field, result.caret, result.value);
  }, [placeCaret]);

  const insertKey = useCallback((spec: KeySpec) => {
    const field = getActive();
    if (!field) return;
    const value = field.getValue() ?? '';
    const result = applyInsert(value, currentSelection(field, value), spec, {
      autoWrap: field.mode === 'latex',
      maxLength: field.maxLength,
    });
    if (!result) {
      flash(`글자 수 제한(${field.maxLength ?? 0}자)을 넘어 입력할 수 없습니다.`);
      return;
    }
    setNotice('');
    commit(field, value, result);
  }, [commit, currentSelection, flash, getActive]);

  const backspace = useCallback(() => {
    const field = getActive();
    if (!field) return;
    const value = field.getValue() ?? '';
    const result = applyBackspace(value, currentSelection(field, value));
    if (!result) return;
    const { pos, delta } = changePoint(value, result.value);
    result.stops = shiftStops(stops.current.get(field.id) ?? [], pos, delta);
    commit(field, value, result);
  }, [commit, currentSelection, getActive]);

  const clearField = useCallback(() => {
    const field = getActive();
    if (!field) return;
    const value = field.getValue() ?? '';
    if (!value) return;
    const sel = currentSelection(field, value);
    commit(field, value, { value: '', caret: 0, stops: [] });
    selections.current.set(field.id, { start: 0, end: 0 });
    void sel;
  }, [commit, currentSelection, getActive]);

  const undo = useCallback(() => {
    const field = getActive();
    if (!field) return;
    const stack = history.current.get(field.id) ?? [];
    const prev = stack.pop();
    if (!prev) {
      flash('되돌릴 입력이 없습니다.');
      return;
    }
    const value = field.getValue() ?? '';
    const { pos, delta } = changePoint(value, prev.value);
    stops.current.set(field.id, shiftStops(stops.current.get(field.id) ?? [], pos, delta));
    field.setValue(prev.value);
    placeCaret(field, prev.caret, prev.value);
  }, [flash, getActive, placeCaret]);

  const jumpNext = useCallback(() => {
    const field = getActive();
    if (!field) return;
    const value = field.getValue() ?? '';
    const caret = currentSelection(field, value).start;
    const target = nextStop(stops.current.get(field.id) ?? [], caret, value.length);
    if (target === null) {
      flash('이동할 다음 칸이 없습니다.');
      return;
    }
    const el = field.el();
    if (el) {
      try {
        el.focus({ preventScroll: false });
        el.setSelectionRange(target, target);
      } catch {
        /* noop */
      }
    }
    selections.current.set(field.id, { start: target, end: target });
  }, [currentSelection, flash, getActive]);

  const activate = useCallback((id: string, focus = false) => {
    activeIdRef.current = id;
    setActiveId(id);
    if (!focus) return;
    const el = handles.current.get(id)?.el();
    if (el) {
      try {
        el.focus({ preventScroll: false });
      } catch {
        /* noop */
      }
    }
  }, []);

  const reportSelection = useCallback((id: string, start: number, end: number) => {
    selections.current.set(id, { start, end });
  }, []);

  const noteEdit = useCallback((id: string, before: string, after: string) => {
    const { pos, delta } = changePoint(before, after);
    stops.current.set(id, shiftStops(stops.current.get(id) ?? [], pos, delta));
    const stack = history.current.get(id) ?? [];
    stack.push({ value: before, caret: Math.min(pos, before.length) });
    if (stack.length > HISTORY_LIMIT) stack.shift();
    history.current.set(id, stack);
  }, []);

  const nativeOffFor = useCallback((id: string, mode: MathFieldMode) => {
    const explicit = nativeOffMap[id];
    if (explicit !== undefined) return explicit;
    return IS_TOUCH && mode === 'plain';
  }, [nativeOffMap]);

  const toggleNative = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const mode = handles.current.get(id)?.mode ?? 'latex';
    setNativeOffMap((prev) => ({ ...prev, [id]: !(prev[id] ?? (IS_TOUCH && mode === 'plain')) }));
  }, []);

  const activeHandle = activeId ? handles.current.get(activeId) ?? null : null;
  const activeMode: MathFieldMode = activeHandle?.mode ?? fields[0]?.mode ?? 'latex';

  const api = useMemo<KeypadApi>(() => ({
    fields,
    activeId,
    activeLabel: activeHandle?.label ?? fields[0]?.label ?? '',
    activeMode,
    activeValue: () => activeHandle?.getValue() ?? '',
    notice,
    isTouch: IS_TOUCH,
    nativeOffFor,
    activate,
    reportSelection,
    noteEdit,
    insertKey,
    backspace,
    clearField,
    undo,
    jumpNext,
    toggleNative,
  }), [
    activate, activeHandle, activeId, activeMode, backspace, clearField, fields, insertKey,
    jumpNext, nativeOffFor, noteEdit, notice, reportSelection, toggleNative, undo,
  ]);

  return (
    <RegistryContext.Provider value={register}>
      <KeypadContext.Provider value={api}>
        {children}
      </KeypadContext.Provider>
    </RegistryContext.Provider>
  );
};

export interface MathInputProps {
  id: string;
  label: string;
  mode: MathFieldMode;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

const BASE_FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '0.4rem',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
  fontSize: '0.85rem',
};

/** 키패드가 붙는 입력창. 값은 부모가 소유하고 여기서는 커서/포커스만 다룬다. */
export const MathInput: React.FC<MathInputProps> = ({
  id,
  label,
  mode,
  value,
  onChange,
  multiline = false,
  rows = 3,
  maxLength,
  placeholder,
  required,
  autoComplete,
  className,
  style,
  ariaLabel,
}) => {
  const register = useContext(RegistryContext);
  const api = useContext(KeypadContext);
  const elRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const propsRef = useRef({ onChange, maxLength });
  propsRef.current = { onChange, maxLength };
  const composing = useRef(false);

  useEffect(() => {
    if (!register) return;
    const handle: FieldHandle = {
      id,
      label,
      mode,
      maxLength: propsRef.current.maxLength,
      el: () => elRef.current,
      getValue: () => valueRef.current,
      setValue: (next) => propsRef.current.onChange(next),
    };
    return register(handle);
  }, [id, label, mode, register]);

  const report = useCallback(() => {
    const el = elRef.current;
    if (!el || typeof el.selectionStart !== 'number') return;
    api?.reportSelection(id, el.selectionStart ?? 0, el.selectionEnd ?? 0);
  }, [api, id]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value;
    const before = valueRef.current;
    if (!composing.current && before !== next) api?.noteEdit(id, before, next);
    propsRef.current.onChange(next);
  };

  const nativeOff = api?.nativeOffFor(id, mode) ?? false;

  const shared = {
    value,
    placeholder,
    required,
    maxLength,
    className: ['math-field', className].filter(Boolean).join(' '),
    style: { ...BASE_FIELD_STYLE, ...(multiline ? { resize: 'vertical' as const } : null), ...style },
    'aria-label': ariaLabel ?? label,
    autoComplete: autoComplete ?? 'off',
    inputMode: nativeOff ? ('none' as const) : undefined,
    spellCheck: false,
    onChange: handleChange,
    onFocus: () => { api?.activate(id); report(); },
    onSelect: report,
    onClick: report,
    onKeyUp: report,
    onBlur: report,
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
  };

  return multiline ? (
    <textarea
      {...shared}
      ref={elRef as unknown as React.Ref<HTMLTextAreaElement>}
      rows={rows}
    />
  ) : (
    <input {...shared} ref={elRef as unknown as React.Ref<HTMLInputElement>} type="text" />
  );
};

const GroupTabs: React.FC<{
  groups: KeyGroupLike[];
  value: string;
  onChange: (id: string) => void;
}> = ({ groups, value, onChange }) => (
  <div className="math-keypad-tabs" role="tablist" aria-label="수식 키 그룹">
    {groups.map((group) => (
      <button
        key={group.id}
        type="button"
        role="tab"
        aria-selected={value === group.id}
        className={value === group.id ? 'is-active' : ''}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(group.id)}
      >
        {group.label}
      </button>
    ))}
  </div>
);

type KeyGroupLike = { id: string; label: string; keys: KeySpec[] };

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};

/** 모바일에서 네이티브 키보드에 가리지 않도록 띄울 높이 */
const useKeyboardOffset = () => {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(gap > 24 ? Math.round(gap) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return offset;
};

export interface MathKeypadBarProps {
  /** LaTeX 필드 미리보기 렌더러 (앱의 renderMath) */
  renderPreview?: (value: string) => React.ReactNode;
}

export const MathKeypadBar: React.FC<MathKeypadBarProps> = ({ renderPreview }) => {
  const api = useMathKeypad();
  const isMobile = useIsMobile();
  const keyboardOffset = useKeyboardOffset();
  const [group, setGroup] = useState('basic');
  const [collapsed, setCollapsed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const groups: KeyGroupLike[] = api?.activeMode === 'plain' ? PLAIN_GROUPS : LATEX_GROUPS;
  const activeGroup = groups.find((g) => g.id === group) ?? groups[0];

  useEffect(() => {
    if (!groups.some((g) => g.id === group)) setGroup(groups[0]?.id ?? 'basic');
  }, [group, groups]);

  if (!api || api.fields.length === 0) return null;

  const preview = previewOpen && api.activeMode === 'latex' && renderPreview
    ? renderPreview(api.activeValue())
    : null;

  const body = (
    <div
      className={`math-keypad ${isMobile ? 'is-float' : 'is-dock'}${collapsed ? ' is-collapsed' : ''}`}
      style={isMobile && keyboardOffset > 0 ? { transform: `translateY(-${keyboardOffset}px)` } : undefined}
      role="group"
      aria-label="수식 입력 키보드"
    >
      <div className="math-keypad-head">
        <span className="math-keypad-title">수식 키보드</span>
        <div className="math-keypad-chips">
          {api.fields.map((field) => (
            <button
              key={field.id}
              type="button"
              className={field.id === api.activeId ? 'is-active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => api.activate(field.id, true)}
            >
              {field.label}
            </button>
          ))}
        </div>
        <div className="math-keypad-head-actions">
          {api.isTouch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={api.toggleNative}
              title="이 입력칸에서 휴대폰 기본 키보드를 쓸지 정합니다."
            >
              {api.nativeOffFor(api.activeId ?? '', api.activeMode) ? '기본 키보드 켜기' : '기본 키보드 끄기'}
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <GroupTabs groups={groups} value={activeGroup?.id ?? ''} onChange={setGroup} />
          <div className="math-keypad-keys">
            {(activeGroup?.keys ?? []).map((spec, index) => (
              <button
                key={`${activeGroup?.id}-${index}-${spec.label}`}
                type="button"
                title={spec.title ?? spec.insert}
                aria-label={spec.title ?? spec.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => api.insertKey(spec)}
              >
                {spec.label}
              </button>
            ))}
          </div>
          <div className="math-keypad-actions">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={api.backspace}>삭제</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={api.jumpNext}>다음 칸</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={api.undo}>되돌리기</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={api.clearField}>비우기</button>
            {api.activeMode === 'latex' && renderPreview && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? '미리보기 닫기' : '미리보기'}
              </button>
            )}
          </div>
        </>
      )}

      {api.notice && <p className="math-keypad-notice" role="status">{api.notice}</p>}

      {preview && (
        <div className="math-keypad-preview" aria-label="입력 미리보기">
          <span className="math-keypad-preview-label">{api.activeLabel} 미리보기</span>
          <div className="math-content">{preview}</div>
        </div>
      )}
    </div>
  );

  // 모바일은 네이티브 키보드 위에, PC는 우측 하단 도크로 — 어느 쪽이든 body에 붙여
  // 좁은 사이드바 안에서 화면 밖으로 밀리지 않게 한다.
  if (typeof document === 'undefined') return body;
  return createPortal(body, document.body);
};
