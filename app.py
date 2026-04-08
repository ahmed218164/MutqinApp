import logging
import traceback
import json
import tempfile
import os
import shutil
import torch
import gradio as gr
from typing import Literal, Optional, Any, get_origin, get_args
from dataclasses import asdict

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from librosa.core import load
from pydantic.fields import FieldInfo, PydanticUndefined

# مكتبات القرآن (تأكد من تثبيتها في بيئتك)
from quran_transcript import Aya, quran_phonetizer, MoshafAttributes
from quran_muaalem.inference import Muaalem
from quran_muaalem.muaalem_typing import MuaalemOutput
from quran_muaalem.explain_gradio import explain_for_gradio
from quran_transcript.phonetics.moshaf_attributes import (
    get_arabic_attributes,
    get_arabic_name,
)

# --- الإعدادات العامة ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAMPLING_RATE = 16000
MODEL_ID = "obadx/muaalem-model-v3_2"

# تحميل النموذج لمرة واحدة عند التشغيل
muaalem = Muaalem(model_name_or_path=MODEL_ID, device=DEVICE)

# إعداد بيانات السور
SURA_IDX_TO_NAME = {}
SURA_TO_AYA_COUNT = {}
temp_aya = Aya()
for idx in range(1, 115):
    temp_aya.set(idx, 1)
    SURA_IDX_TO_NAME[idx] = temp_aya.get().sura_name
    SURA_TO_AYA_COUNT[idx] = temp_aya.get().num_ayat_in_sura

DEFAULT_MOSHAF = MoshafAttributes(
    rewaya="hafs", madd_monfasel_len=4, madd_mottasel_len=4,
    madd_mottasel_waqf=4, madd_aared_len=4,
)
current_moshaf = DEFAULT_MOSHAF

REQUIRED_MOSHAF_FIELDS = [
    "rewaya", "takbeer", "madd_monfasel_len", "madd_mottasel_len",
    "madd_mottasel_waqf", "madd_aared_len", "madd_alleen_len",
    "ghonna_lam_and_raa", "meem_aal_imran", "madd_yaa_alayn_alharfy",
    "saken_before_hamz", "sakt_iwaja", "sakt_marqdena", "sakt_man_raq",
    "sakt_bal_ran", "sakt_maleeyah", "between_anfal_and_tawba",
    "noon_and_yaseen", "yaa_ataan", "start_with_ism", "yabsut",
    "bastah", "almusaytirun", "bimusaytir", "tasheel_or_madd",
    "yalhath_dhalik", "irkab_maana", "noon_tamnna", "harakat_daaf",
    "alif_salasila", "idgham_nakhluqkum", "raa_firq", "raa_alqitr",
    "raa_misr", "raa_nudhur", "raa_yasr", "meem_mokhfah",
]

# --- وظائف مساعدة لواجهة Gradio ---
def get_field_label(name: str, info: FieldInfo) -> str:
    arabic = get_arabic_name(info)
    return f"{arabic} ({name})" if arabic else name

def create_gradio_input(field_name: str, field_info: FieldInfo, default_val: Any):
    label = get_field_label(field_name, field_info)
    help_text = field_info.description
    
    if get_origin(field_info.annotation) is Literal:
        choices = list(get_args(field_info.annotation))
        arabic_attrs = get_arabic_attributes(field_info)
        choice_list = [(arabic_attrs[c], c) if arabic_attrs and c in arabic_attrs else (str(c), c) for c in choices]
        return gr.Dropdown(choices=choice_list, value=default_val, label=label, info=help_text)

    if field_info.annotation in [str, Optional[str]]: return gr.Textbox(value=default_val or "", label=label)
    if field_info.annotation in [int, Optional[int], float, Optional[float]]: return gr.Number(value=default_val or 0, label=label)
    if field_info.annotation in [bool, Optional[bool]]: return gr.Checkbox(value=default_val or False, label=label)
    return gr.Textbox(label=label)

# --- الدوال المنطقية (Backend Logic) ---
def update_aya_list(sura_idx):
    count = SURA_TO_AYA_COUNT.get(int(sura_idx), 7)
    return gr.update(choices=list(range(1, count + 1)), value=1)

def get_uthmani_preview(sura, aya, start, count):
    try:
        return Aya(int(sura), int(aya)).get_by_imlaey_words(int(start), int(count)).uthmani
    except: return "تعذر استخراج النص، تأكد من نطاق الكلمات."

def process_audio_gradio(audio_path, sura, aya, start, count):
    if not audio_path: return "الرجاء رفع ملف صوتي"
    try:
        uthmani = Aya(int(sura), int(aya)).get_by_imlaey_words(int(start), int(count)).uthmani
        phon_ref = quran_phonetizer(uthmani, current_moshaf, remove_spaces=True)
        wave, _ = load(audio_path, sr=SAMPLING_RATE, mono=True)
        outs = muaalem([wave], [phon_ref], sampling_rate=SAMPLING_RATE)
        return explain_for_gradio(outs[0].phonemes.text, phon_ref.phonemes, outs[0].sifat, phon_ref.sifat, lang="arabic")
    except Exception as e:
        return f"خطأ في المعالجة: {str(e)}"

def save_moshaf_configs(*args):
    global current_moshaf
    try:
        current_moshaf = MoshafAttributes(**dict(zip(REQUIRED_MOSHAF_FIELDS, args)))
        return "✅ تم حفظ إعدادات المصحف"
    except Exception as e:
        return f"❌ خطأ: {str(e)}"

# --- بناء الواجهة (Gradio UI) ---
with gr.Blocks(title="المعلم القرآني - متقن", theme=gr.themes.Soft()) as ui:
    gr.Markdown("# نظام تصحيح التلاوة الآلي")
    
    with gr.Tab("التحليل المباشر"):
        with gr.Row():
            with gr.Column():
                sura_input = gr.Dropdown(choices=[(f"{idx}. {name}", idx) for idx, name in SURA_IDX_TO_NAME.items()], label="السورة", value=1)
                aya_input = gr.Dropdown(choices=list(range(1, 8)), label="الآية", value=1)
                with gr.Row():
                    word_start = gr.Number(value=0, label="بدءاً من الكلمة", precision=0)
                    word_count = gr.Number(value=5, label="عدد الكلمات", precision=0)
                uthmani_display = gr.Textbox(label="النص المطلوب تلاوته", interactive=False)
                audio_input = gr.Audio(sources=["upload", "microphone"], type="filepath", label="سجل تلاوتك")
                btn = gr.Button("فحص التلاوة الآن", variant="primary")
            
            with gr.Column():
                result_output = gr.HTML(label="النتيجة")

        # ربط الأحداث
        sura_input.change(update_aya_list, sura_input, aya_input)
        for input_comp in [sura_input, aya_input, word_start, word_count]:
            input_comp.change(get_uthmani_preview, [sura_input, aya_input, word_start, word_count], uthmani_display)
        btn.click(process_audio_gradio, [audio_input, sura_input, aya_input, word_start, word_count], result_output)

    with gr.Tab("إعدادات الرواية"):
        moshaf_inputs = []
        for field in REQUIRED_MOSHAF_FIELDS:
            moshaf_inputs.append(create_gradio_input(field, MoshafAttributes.model_fields[field], getattr(DEFAULT_MOSHAF, field)))
        save_btn = gr.Button("حفظ التغييرات")
        config_msg = gr.Markdown()
        save_btn.click(save_moshaf_configs, inputs=moshaf_inputs, outputs=config_msg)

# --- واجهة FastAPI ---
fastapi_app = FastAPI(title="Mutaqin API")

@fastapi_app.post("/correct-recitation")
async def api_correct_recitation(
    file: UploadFile = File(...),
    uthmani_text: str = Form(...),
    surah: Optional[int] = Form(None),
    ayah_from: Optional[int] = Form(None),
    ayah_to: Optional[int] = Form(None),
):
    tmp_path = None
    try:
        # 1. حفظ الملف مؤقتاً بأمان مع الامتداد الصحيح
        # CRITICAL: the suffix MUST match the actual codec.
        # Sending an m4a file with a .wav suffix causes librosa/ffmpeg 
        # to misidentify the codec and load an empty audio array → model fails.
        original_filename = file.filename or "audio.m4a"
        _, file_ext = os.path.splitext(original_filename)
        file_ext = file_ext.lower() if file_ext else ".m4a"  # default to .m4a (Android)

        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        logger.info(f"[API] Saved upload as: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")

        # 2. Build phonetic references per ayah
        # ─────────────────────────────────────────────────────────────────
        # STRATEGY A — surah + ayah_from/to provided by mobile:
        #   Use Aya class to fetch CANONICAL text directly from the quran_transcript
        #   library's own database. Guaranteed to be properly encoded and compatible
        #   with quran_phonetizer, bypassing all SQLite Unicode encoding differences.
        # STRATEGY B — fallback (only uthmani_text available):
        #   Split by '*' and try each piece individually (may fail for some ayahs).

        ayah_texts = []  # list of (ayah_label, text_string)

        if surah and ayah_from and ayah_to:
            logger.info(f"[API] Strategy A: using Aya class for surah={surah} ayah {ayah_from}–{ayah_to}")
            for ayah_num in range(ayah_from, ayah_to + 1):
                try:
                    canonical_text = Aya(surah, ayah_num).get().uthmani
                    ayah_texts.append((f"{surah}:{ayah_num}", canonical_text))
                    logger.info(f"[API] Fetched ayah {surah}:{ayah_num} from Aya class OK")
                except Exception as e:
                    logger.warning(f"[API] Aya class failed for {surah}:{ayah_num}: {e}")
        else:
            logger.info("[API] Strategy B: splitting uthmani_text by '*' (no surah/ayah params)")
            parts = [a.strip() for a in uthmani_text.split('*') if a.strip()]
            if not parts:
                parts = [uthmani_text.strip()]
            ayah_texts = [(f"part_{i+1}", text) for i, text in enumerate(parts)]

        logger.info(f"[API] Phonetizing {len(ayah_texts)} ayah(s)...")
        phon_refs = []
        for label, text in ayah_texts:
            try:
                pr = quran_phonetizer(text, current_moshaf, remove_spaces=True)
                phon_refs.append((label, pr))
                logger.info(f"[API] Phonetized {label} OK")
            except Exception as e:
                logger.warning(f"[API] Phonetizer failed for {label}: {e}")

        if not phon_refs:
            return JSONResponse(
                content={"status": "error", "message": "فشل تحليل النص القرآني. تأكد من صحة النطاق المرسل."},
                status_code=400
            )

        # Load audio
        wave, _ = load(tmp_path, sr=SAMPLING_RATE, mono=True)

        # Guard: log and reject empty/corrupt audio
        duration_sec = len(wave) / SAMPLING_RATE
        logger.info(f"[API] Audio loaded: shape={wave.shape}, duration={duration_sec:.2f}s")
        if len(wave) == 0 or duration_sec < 0.5:
            logger.warning(f"[API] Audio too short or empty after loading ({duration_sec:.2f}s). Rejecting.")
            return JSONResponse(
                content={"status": "error", "message": "Audio too short or could not be decoded."},
                status_code=400
            )

        # Run muaalem — SINGLE BATCHED CALL with all ayah phon_refs at once.
        # ─────────────────────────────────────────────────────────────────────────
        # muaalem(waves, phon_refs, sampling_rate) accepts lists:
        #   waves       = [wave] * N   (same audio, repeated N times)
        #   phon_refs   = [pr1, pr2, ..., prN]
        # This is ~N× faster than calling muaalem once per ayah because
        # the model processes all alignments in a single batched forward pass.

        labels     = [lbl for lbl, _  in phon_refs]
        phon_only  = [pr  for _,   pr in phon_refs]
        waves_batch = [wave] * len(phon_only)

        # outs[i] will be paired with phon_only[i] for comparison
        outs = []
        detected_phonemes = ""

        try:
            logger.info(f"[API] Running batched muaalem for {len(phon_only)} ayah(s)...")
            batch_outs = muaalem(waves_batch, phon_only, sampling_rate=SAMPLING_RATE)

            if not batch_outs or len(batch_outs) == 0:
                logger.warning("[API] Batched muaalem returned empty output — retrying sequentially.")
                raise ValueError("empty batch output — fall through to sequential retry")

            outs = list(batch_outs)
            for i, out in enumerate(outs):
                label = labels[i] if i < len(labels) else f"ayah_{i+1}"
                detected_phonemes += out.phonemes.text + " "
                logger.info(f"[API] {label} → sifat count={len(out.sifat)}")

        except Exception as batch_err:
            logger.warning(f"[API] Batched call failed ({batch_err}), falling back to sequential.")
            outs = []
            detected_phonemes = ""
            for idx_seq, (label, phon_ref) in enumerate(phon_refs):
                try:
                    seq_result = muaalem([wave], [phon_ref], sampling_rate=SAMPLING_RATE)
                    if seq_result and len(seq_result) > 0:
                        outs.append(seq_result[0])
                        detected_phonemes += seq_result[0].phonemes.text + " "
                        logger.info(f"[API] {label} (sequential) sifat count={len(seq_result[0].sifat)}")
                    else:
                        logger.warning(f"[API] {label} sequential muaalem returned empty output.")
                        outs.append(None)  # placeholder to keep indexing aligned
                except Exception as e:
                    logger.warning(f"[API] {label} sequential muaalem failed: {e}")
                    outs.append(None)

        # Check we have at least some output
        valid_outs = [o for o in outs if o is not None]
        if not valid_outs:
            return JSONResponse(
                content={"status": "error", "message": "Model could not process the audio. Audio might be unclear or empty."},
                status_code=400
            )

        # ─────────────────────────────────────────────────────────────────────────
        # 4. SCORING — Compare PREDICTED sifat (from audio) vs REFERENCE sifat
        # ─────────────────────────────────────────────────────────────────────────
        #
        # The 10 tajweed rules present on each Sifa dataclass:
        TAJWEED_RULES = [
            "hams_or_jahr", "shidda_or_rakhawa", "tafkheem_or_taqeeq",
            "itbaq", "safeer", "qalqla", "tikraar", "tafashie",
            "istitala", "ghonna",
        ]

        total_rules_checked = 0
        total_mismatches = 0
        mistakes_detail = []
        all_serialized_sifat = []  # for the response payload

        for i in range(len(outs)):
            out = outs[i]
            if out is None or i >= len(phon_only):
                continue

            ref = phon_only[i]
            pred_sifat = out.sifat
            ref_sifat = ref.sifat if hasattr(ref, 'sifat') else []
            label = labels[i] if i < len(labels) else f"ayah_{i+1}"

            # Serialize predicted sifat for the response
            for ps in pred_sifat:
                all_serialized_sifat.append(asdict(ps))

            # Compare each predicted sifa against its reference counterpart
            num_pairs = min(len(pred_sifat), len(ref_sifat))
            ayah_mismatches = 0

            for j in range(num_pairs):
                pred_s = pred_sifat[j]
                ref_s  = ref_sifat[j]
                phoneme_text = pred_s.phonemes_group if hasattr(pred_s, 'phonemes_group') else ""

                for rule in TAJWEED_RULES:
                    pred_unit = getattr(pred_s, rule, None)
                    ref_unit  = getattr(ref_s, rule, None)

                    # Skip if either side is None (e.g., tafashie=None for short segments)
                    if pred_unit is None or ref_unit is None:
                        continue

                    pred_text = pred_unit.text if hasattr(pred_unit, 'text') else str(pred_unit)
                    ref_text  = ref_unit.text  if hasattr(ref_unit, 'text')  else str(ref_unit)

                    total_rules_checked += 1
                    if pred_text != ref_text:
                        total_mismatches += 1
                        ayah_mismatches += 1
                        mistakes_detail.append({
                            "ayah": label,
                            "phoneme": phoneme_text,
                            "rule": rule,
                            "expected": ref_text,
                            "actual": pred_text,
                            "confidence": round(pred_unit.prob, 3) if hasattr(pred_unit, 'prob') and pred_unit.prob is not None else None,
                        })

            logger.info(f"[API] {label}: compared {num_pairs} sifa pairs → {ayah_mismatches} mismatches")

        # Compute score
        if total_rules_checked > 0:
            score_pct = round(100 * (1 - total_mismatches / total_rules_checked))
            score_pct = max(0, min(100, score_pct))
        else:
            score_pct = 100

        logger.info(
            f"[API] FINAL SCORE: {total_mismatches}/{total_rules_checked} rules mismatched "
            f"→ score={score_pct}%  ({len(mistakes_detail)} mistake details)"
        )
        if mistakes_detail[:5]:
            logger.info(f"[API] Sample mistakes: {json.dumps(mistakes_detail[:5], ensure_ascii=False, default=str)}")

        response_data = {
            "status": "success",
            "sifat": all_serialized_sifat,
            "phonemes_detected": detected_phonemes.strip(),
            # ── Scoring summary (real comparison-based) ──
            "total_sifat": len(all_serialized_sifat),
            "total_rules_checked": total_rules_checked,
            "total_mismatches": total_mismatches,
            "score": score_pct,
            # ── Detailed mistakes for UI display ──
            "mistakes": mistakes_detail,
        }
        logger.info(f"[API] Success: {len(all_serialized_sifat)} sifat, {total_rules_checked} rules across {len(phon_refs)} ayah(s).")
        return JSONResponse(content=response_data)

    except Exception as e:
        logger.error(f"API Error: {e}\n{traceback.format_exc()}")
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)
    finally:
        # 4. تنظيف الملفات المؤقتة دائماً
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

# دمج النظامين
app = gr.mount_gradio_app(fastapi_app, ui, path="/")

if __name__ == "__main__":
    import uvicorn
    # تشغيل السيرفر على بورت 8000
    uvicorn.run(app, host="0.0.0.0", port=7860)