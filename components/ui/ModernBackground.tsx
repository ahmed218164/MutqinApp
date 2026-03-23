/**
 * ModernBackground — خلفية ثابتة خفيفة
 * الإصلاح: إزالة الكرات المتحركة اللانهائية (كانت 2 × Animated.loop كل 8-12 ثانية)
 * واستبدالها بتدرج ثابت لا يستهلك CPU/GPU على الإطلاق.
 */
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/theme';

// مكوّن بسيط بدون رسوم متحركة — نفس التأثير البصري بدون overhead
export default function ModernBackground() {
    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[
                    '#060d14',
                    '#071a14',
                    '#061510',
                    '#080d14',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {/* Accent glow — static, zero CPU cost */}
            <View style={styles.glowTop} />
            <View style={styles.glowBottom} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#07111a',
        zIndex: -1,
        overflow: 'hidden',
    },
    glowTop: {
        position: 'absolute',
        top: -80,
        left: -60,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(16,185,129,0.07)',
    },
    glowBottom: {
        position: 'absolute',
        bottom: -100,
        right: -80,
        width: 280,
        height: 280,
        borderRadius: 140,
        backgroundColor: 'rgba(6,78,59,0.08)',
    },
});
