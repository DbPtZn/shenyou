import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, timing } from '@/theme/tokens';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** 底部弹层：背景遮罩 + 300ms ease-out 上滑（宪法动画纪律） */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(999);
      Animated.timing(translateY, {
        toValue: 0,
        duration: timing.normal,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  const handleClose = (): void => {
    Animated.timing(translateY, {
      toValue: 999,
      duration: timing.fast,
      useNativeDriver: true,
    }).start(onClose);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grab} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3,5,14,0.62)',
  },
  sheet: {
    backgroundColor: colors.pBg2,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grab: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.card2,
    alignSelf: 'center',
    marginBottom: spacing.base,
  },
});
