import { useController } from 'react-hook-form';
import type { Control, FieldPath, FieldValues, RegisterOptions } from 'react-hook-form';
import { Selecteur } from './Selecteur';
import type { SelecteurProps } from './Selecteur';

type ProprietesSimples = Omit<Extract<SelecteurProps, { multiple?: false }>, 'value' | 'onChange' | 'onBlur' | 'error'>;

/**
 * Selecteur branché sur React Hook Form. Un composant personnalisé ne
 * peut pas recevoir {...register('champ')} (réservé aux éléments natifs) :
 * useController en fait un champ contrôlé, avec la même valeur
 * enregistrée et les mêmes validations qu'avant.
 */
export function SelecteurChamp<T extends FieldValues>({
  name,
  control,
  rules,
  ...props
}: ProprietesSimples & {
  name: FieldPath<T>;
  control: Control<T>;
  rules?: RegisterOptions<T, FieldPath<T>>;
}) {
  const { field, fieldState } = useController({ name, control, rules });
  return (
    <Selecteur
      {...props}
      value={(field.value as string | undefined) ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  );
}
