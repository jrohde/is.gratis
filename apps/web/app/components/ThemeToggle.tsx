import { ActionIcon, Menu, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

/** Follows the system by default; readers can pin light or dark. Mantine remembers the choice. */
export function ThemeToggle() {
  const t = messages(useUiLang());
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const options: Array<{ value: MantineColorScheme; label: string; icon: typeof IconSun }> = [
    { value: 'auto', label: t.themeAuto, icon: IconDeviceDesktop },
    { value: 'light', label: t.themeLight, icon: IconSun },
    { value: 'dark', label: t.themeDark, icon: IconMoon },
  ];
  const Current = options.find((option) => option.value === colorScheme)?.icon ?? IconDeviceDesktop;
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={t.theme}>
          <Current size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map(({ value, label, icon: Icon }) => (
          <Menu.Item key={value} leftSection={<Icon size={16} />} onClick={() => setColorScheme(value)}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
