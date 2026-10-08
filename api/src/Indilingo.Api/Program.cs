using Indilingo.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddIndilingo(builder.Configuration);

var app = builder.Build();
app.UseIndilingo();
app.Run();

// Lets the test project start the whole app in memory.
public partial class Program;
