# حل مشكلة اختفاء لوحة المفاتيح في واجهة الخطة

## 🐛 **المشكلة**

عند الكتابة في حقول الإدخال في واجهة الخطة:
1. تظهر لوحة المفاتيح
2. عند كتابة حرف واحد، تختفي لوحة المفاتيح
3. يجب الضغط على الحقل مرة أخرى
4. تتكرر المشكلة مع كل حرف

### **السبب:**
- لوحة المفاتيح تدفع المحتوى للأعلى
- الحقل النصي يخرج من منطقة الرؤية
- يفقد الـ `TextInput` التركيز (focus)
- تختفي لوحة المفاتيح تلقائياً

---

## ✅ **الحل المطبق**

### **1. استخدام KeyboardAvoidingView**

استبدلنا `<View>` العادي بـ `<KeyboardAvoidingView>`:

```tsx
// ❌ قبل (المشكلة)
<View style={styles.container}>
    <ModernBackground />
    <SafeAreaView style={styles.safeArea}>
        <ScrollView>
            {/* المحتوى */}
        </ScrollView>
    </SafeAreaView>
</View>

// ✅ بعد (الحل)
<KeyboardAvoidingView 
    style={styles.container}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
>
    <ModernBackground />
    <SafeAreaView style={styles.safeArea}>
        <ScrollView keyboardShouldPersistTaps="handled">
            {/* المحتوى */}
        </ScrollView>
    </SafeAreaView>
</KeyboardAvoidingView>
```

### **2. إضافة keyboardShouldPersistTaps**

أضفنا خاصية `keyboardShouldPersistTaps="handled"` للـ `ScrollView`:

```tsx
<ScrollView 
    style={styles.content} 
    showsVerticalScrollIndicator={false} 
    contentContainerStyle={styles.scrollContent}
    keyboardShouldPersistTaps="handled"  // ← هذا يمنع إغلاق لوحة المفاتيح عند الضغط على ScrollView
>
```

---

## 🔧 **كيف يعمل الحل؟**

### **KeyboardAvoidingView Props:**

1. **`behavior`**:
   - **iOS**: `'padding'` - يضيف padding للمحتوى
   - **Android**: `'height'` - يغير ارتفاع الـ container

2. **`keyboardVerticalOffset`**:
   - **iOS**: `0` - لا حاجة لـ offset إضافي
   - **Android**: `20` - offset صغير لتحسين المظهر

3. **`keyboardShouldPersistTaps="handled"`**:
   - يسمح بالضغط على العناصر داخل ScrollView دون إغلاق لوحة المفاتيح
   - يغلق لوحة المفاتيح فقط عند الضغط على مناطق فارغة

---

## 📱 **السلوك المتوقع الآن**

### **على iOS:**
- لوحة المفاتيح تظهر
- المحتوى يتحرك للأعلى بسلاسة (padding)
- الحقل النشط يبقى مرئياً
- يمكن الكتابة بشكل طبيعي

### **على Android:**
- لوحة المفاتيح تظهر
- ارتفاع الـ container يتغير
- الحقل النشط يبقى مرئياً
- يمكن الكتابة بشكل طبيعي

---

## 🎯 **التحسينات الإضافية المطبقة**

### **1. استيراد المكونات الضرورية:**
```tsx
import {
    KeyboardAvoidingView,  // ← للتعامل مع لوحة المفاتيح
    Platform,              // ← للتفريق بين iOS و Android
    Keyboard,              // ← للتحكم في لوحة المفاتيح برمجياً
    TouchableWithoutFeedback, // ← لإغلاق لوحة المفاتيح عند الضغط خارج الحقول
} from 'react-native';
```

### **2. إمكانية إغلاق لوحة المفاتيح (اختياري):**

إذا أردت إضافة إمكانية إغلاق لوحة المفاتيح عند الضغط في أي مكان:

```tsx
<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <KeyboardAvoidingView>
        {/* المحتوى */}
    </KeyboardAvoidingView>
</TouchableWithoutFeedback>
```

---

## 🧪 **اختبار الحل**

### **خطوات الاختبار:**
1. ✅ افتح واجهة الخطة
2. ✅ اضغط على حقل "الاسم المستعار"
3. ✅ اكتب عدة أحرف متتالية
4. ✅ تأكد أن لوحة المفاتيح لا تختفي
5. ✅ انتقل لحقل "العمر"
6. ✅ اكتب أرقام
7. ✅ انتقل لحقل "الملاحظات" (multiline)
8. ✅ اكتب عدة أسطر

### **النتيجة المتوقعة:**
- ✅ لوحة المفاتيح تبقى ظاهرة أثناء الكتابة
- ✅ الحقل النشط يبقى مرئياً
- ✅ يمكن الانتقال بين الحقول بسلاسة
- ✅ لا توجد قفزات مفاجئة في الواجهة

---

## 📚 **مراجع إضافية**

### **KeyboardAvoidingView Behaviors:**
- **`height`**: يغير ارتفاع الـ view
- **`position`**: يغير موضع الـ view
- **`padding`**: يضيف padding للـ view

### **متى تستخدم كل behavior:**
- **iOS**: استخدم `'padding'` أو `'position'`
- **Android**: استخدم `'height'` (الأكثر استقراراً)

### **بدائل أخرى:**
- **react-native-keyboard-aware-scroll-view**: مكتبة خارجية أكثر تطوراً
- **KeyboardAvoidingScrollView**: مكون مخصص يجمع بين الاثنين

---

## ✅ **الملخص**

**التغييرات المطبقة:**
1. ✅ استبدال `View` بـ `KeyboardAvoidingView`
2. ✅ إضافة `behavior` مختلف لـ iOS و Android
3. ✅ إضافة `keyboardVerticalOffset` للضبط الدقيق
4. ✅ إضافة `keyboardShouldPersistTaps="handled"` للـ ScrollView
5. ✅ استيراد `Platform` للتفريق بين الأنظمة

**النتيجة:**
- 🎉 لوحة المفاتيح تعمل بشكل طبيعي
- 🎉 تجربة مستخدم سلسة
- 🎉 دعم كامل لـ iOS و Android
