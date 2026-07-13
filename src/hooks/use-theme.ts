/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useAppTheme } from '../../components/ThemeProvider';

export function useTheme() {
  try {
    const { theme } = useAppTheme();
    return Colors[theme];
  } catch {
    return Colors.dark;
  }
}
