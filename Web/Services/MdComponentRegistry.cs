using System.Reflection;
using Web.Components;

namespace Web.Services;

/// <summary>
/// Singleton that maps md-component sentinel names to their Razor component types.
/// Any component decorated with <see cref="MdComponentAttribute"/> is automatically registered.
/// </summary>
public sealed class MdComponentRegistry
{
    private readonly Dictionary<string, Type> _map;

    public MdComponentRegistry()
    {
        _map = [];

        foreach (var type in Assembly.GetExecutingAssembly().GetTypes())
        {
            foreach (var attr in type.GetCustomAttributes<MdComponentAttribute>())
                _map[attr.Name] = type;
        }
    }

    /// <summary>Returns the component type for the given sentinel name, or null if not registered.</summary>
    public Type? Resolve(string name) =>
        _map.TryGetValue(name, out var t) ? t : null;

    /// <summary>All registered name → type mappings (for debugging).</summary>
    public IReadOnlyDictionary<string, Type> All => _map;
}
