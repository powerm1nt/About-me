namespace Web.Components;

/// <summary>
/// Marks a Razor component as a renderable md-component.
/// The <paramref name="name"/> must match the sentinel type produced by the server
/// (e.g. "info", "warning", "blog-index").
/// A single component class may carry multiple attributes for multiple names.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = true, Inherited = false)]
public sealed class MdComponentAttribute(string name) : Attribute
{
    public string Name { get; } = name;
}
