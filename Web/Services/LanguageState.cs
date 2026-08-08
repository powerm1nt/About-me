namespace Web.Services;

/// <summary>Shared singleton that holds the current UI language and notifies subscribers on change.</summary>
public class LanguageState
{
    private bool _isJapanese;

    public bool IsJapanese
    {
        get => _isJapanese;
        private set
        {
            if (_isJapanese == value) return;
            _isJapanese = value;
            OnChange?.Invoke();
        }
    }

    public event Action? OnChange;

    public void SetLanguage(bool japanese) => IsJapanese = japanese;
}
